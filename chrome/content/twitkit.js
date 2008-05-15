/*
	TwitKit v1.0
	
	Based off of Tweetbar by Mike Demers [mike@mikedemers.net]
	
	homepage:  http://engel.uk.to/twitkit

	Todo:
		* Search twittersearch.com from TwitKit
		-----------------------------------------------------------------------
		* don't make an extra request when authenticating
		* improve behavior when twitter is down
		* highlight friends and followers in public timeline
		* add a configurable maximum tweet count
		* don't send the an update if the status box is empty
		* do some profiling... i think i'm leaking memory
		* add ability to "share" theme by uploading to TwitKit site?
		* import theme from twitter profile? (ryan)
		* add ability to block users
			* requires maintenance panel
		* behave better when multiple windows are open
		* add tinyurl-ifier (highlight and click?)
			* look into urltea.com (it offers an API)
		* add ability to "insert link from browser" and/or "insert browser selection"
			* use: window._content.document.title
		* add support for multiple accounts
		* direct-messaging support
	*/

var Tweetbar = {
	
	// Variables //	
	tweets: {
		friends: {},
		followers: {},
		public_timeline: {},
		friends_timeline: {},
		replies: {},
		me: {},
	},			
	month_names: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
	isAuthenticated: false,
	currentList: null,
	updater: null,
	loginSlider: null,
	username: null,
	password: null,
	pendingAction: null,
	httpHeaders: null,
	prefService: null,
	
	// Startup Functions //	
	run:
		function() {
			Tweetbar.prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.twitkit.");
			Tweetbar.cookieManager = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager);
			
			var scheme = Tweetbar.prefService.getCharPref('colorScheme').toLowerCase();
			var link = new Element('link');
			link.setProperties({
				'rel': 'stylesheet',
				'href': 'chrome://twitkit/skin/' + scheme + '.css',
				'type': 'text/css',
				'media': 'screen',
			});
			link.injectInside('thehead');
			
			$('thebody').setStyle('font-size', Tweetbar.prefService.getCharPref('fontSize') + '%');
			
			this.setListHeight();
			
			this.loginSlider = new Fx.Slide('loginform', {duration: 500});
			this.loginSlider.hide();
			
			var initial_panel = '';
			try {
				initial_panel = Tweetbar.prefService.getCharPref('active_panel');
			} catch(e) {
				initial_panel = 'public_timeline';
				Tweetbar.prefService.setCharPref('active_panel', initial_panel);
			}
			
			try {
				Tweetbar.username = Tweetbar.prefService.getCharPref('username');
				Tweetbar.password = Tweetbar.prefService.getCharPref('password');
				Tweetbar.isAuthenticated = true;
				Tweetbar.set_username_on_page();
			} catch(e) { }
			
			this.activate_panel(initial_panel);
		},
	
	// HTTP Headers //
	clear_http_headers:
		function() {
			Tweetbar.httpHeaders = null;
		},	
	http_headers:
		function() {
			if(!Tweetbar.httpHeaders) {
				Tweetbar.httpHeaders = {
					'X-Twitter-Client': 'TwitKit',
					'X-Twitter-Client-Version': '1.0',
					'X-Twitter-Client-URL': 'http://engel.uk.to/twitkit/1.0.xml',
				};
				if(Tweetbar.username && Tweetbar.password) {
					Tweetbar.httpHeaders['Authorization'] = Tweetbar.http_basic_auth();
				}
			}
			return Tweetbar.httpHeaders;
		},
	http_basic_auth:
		function() {
			return 'Basic '+btoa(Tweetbar.username+':'+Tweetbar.password);
		},
	
	// Cookies //
	clear_cookies:
		function() {
			var url = 'HTTP://TWITTER.COM';
			var iter = Tweetbar.cookieManager.enumerator;
			while (iter.hasMoreElements()) {
				var cookie = iter.getNext();
				if (cookie instanceof Components.interfaces.nsICookie) {
					if (url.indexOf(cookie.host.toUpperCase()) != -1) {
						Tweetbar.cookieManager.remove(cookie.host, cookie.name, cookie.path, cookie.blocked);
					}
				}
			}
		},
		
	// Miscellaneous //
	api_url_for:
		function(resource) {
			return 'http://twitter.com/statuses/' + resource + '.json';
		},
	expand_status:
		function(s) {
			return s.toString().replace(/\</,'&lt;').replace(/(https?:\/\/([-\w\.]+)+(:\d+)?(\/([\w\/_\.]*(\?\S+)?)?)?)/g, this.anchor_tag('$1')).replace(/\@([0-9a-z_A-Z]+)/g, this.anchor_tag('http://twitter.com/$1'.toLowerCase(),'@$1','$1 on twitter'));
		},
	create_status_object:
		function(obj) {
			return {
				'id': parseInt(obj.id),
				'text': Tweetbar.expand_status(obj.text),
				'created_at': Date.parse(obj.created_at || Date()),
				'source': obj.source,
			}
		},
	
	create_user_object:
		function(obj) {
			return {
				'id': parseInt(obj.id),
				'url': obj.url,
				'profile_image_url': obj.profile_image_url,
				'name': obj.name,
				'location': obj.location,
				'description': obj.description,
				'screen_name': obj.screen_name,
			}
		},
	user_anchor_tag:
		function(user, text) {
			var name;
			( Tweetbar.prefService.getCharPref('showNamesAs') == 'screennames' ) ? name = user['screen_name'] : name = user['name'];
			return this.anchor_tag('http://twitter.com/' + user['screen_name'],
									( (text) ? text : name),
									user['name'] + ' in ' + user['location']);
		},
		
	anchor_tag:
		function (url, text, title) {
			return '<a href="'+url+'" target="_blank" title="' +
					( (title) ? title : '') +'" alt="'+
					( (title) ? title : '') +'">'+
					( (text) ? text : url ) + '</a>';
		},
	relative_time_string:
		function (time_value) {
		   var delta = parseInt(((new Date).getTime() - time_value) / 1000);
		   
		   if(delta < 60) {
			   return 'less than a minute ago';
		   } else if(delta < 120) {
			   return 'about a minute ago';
		   } else if(delta < (45*60)) {
			   return (parseInt(delta / 60)).toString() + ' minutes ago';
		   } else if(delta < (90*60)) {
			   return 'about an hour ago';
		   } else if(delta < (24*60*60)) {
			   return 'about ' + (parseInt(delta / 3600)).toString() + ' hours ago';
		   } else if(delta < (48*60*60)) {
			   return '1 day ago';
		   } else {
			   return (parseInt(delta / 86400)).toString() + ' days ago';
		   }
		},
		
	// Misc. Tweet Functions //
	current_tweets:
		function() {
			return this.tweets[this.currentList];
		},		
	clear_current_tweets:
		function() {
			var panel = this.currentList;
			
			for(var tweet in this.tweets[panel]) {
				if(this.tweets[panel][tweet]._b) {
					delete this.tweets[panel][tweet];
				}
			}
			this.update_current_list();
		},
	
	// Rendering //
	render_tweet:
		function(tweet, li) {
			var display_date = '';
			if(tweet) {
				if(!tweet._a) {
					tweet._a = true;
				} else if(!tweet._b) {
					tweet._b = true;
				}
				if ( this.currentList != 'replies' ) { li.setProperty('id', tweet.id); }
				var user_image = '';
				if(tweet.user && tweet.user.profile_image_url) {
					user_image = '<img src="' + tweet.user.profile_image_url +
								 '" width="24" height="24" alt="'+tweet.user.name+'" />';
				}
				var tsource = tweet.source;
				tsource = tsource.replace(/<a /, '<a target="_blank" ');
				( Tweetbar.prefService.getBoolPref('showAppSource') ) ? source = '<div class="source">from ' + tsource + '</div>' : source = '';
				( tweet.user['screen_name'] == Tweetbar.username ) ? dellink = '<a href="#" onclick="Tweetbar.delete_tweet(\'' + tweet.id + '\');"><img style="border: none; float: right;" src="chrome://twitkit/skin/delete.png" alt="" /></a>' : dellink = '';
				( this.currentList == 'replies' ) ? date = '' : date = ' - ' + Tweetbar.relative_time_string(tweet.created_at);
				/*
				 * Hashtags implementation - by Joschi
				 */
				tweet.text = tweet.text.replace(/(#(\w*))/g,'<a target="_blank" href="http://hashtags.org/tag/$2">$1</a>');
				return '<p class="pic"><a href="#" onclick="setReply(\'' + tweet.user['screen_name'] + '\');">'+ user_image + '</a>' +
					   '<span class="re"><a class="re" href="#" onclick="setReply(\''+ tweet.user['screen_name'] + '\'); return false;"><img class="re" src="chrome://twitkit/skin/reply.png" alt="" /></a>&nbsp;' +
					   '<a class="re" href="javascript: Tweetbar.fav_tweet(\'' + tweet.id + '\'); void 0;"><img class="re" src="chrome://twitkit/skin/fav_add.png" alt="" /></a></span></p>' +
					   '<p class="what">' + tweet.text + '</p>' +
					   '<p class="who">' + this.user_anchor_tag(tweet.user) + date + '</p>' +
					   source + dellink;
			}
		},
	render_user:
		function(user) {
			( user.protected == true ) ? status = '<em>My updates are protected.</em>' : status = user.status.text;
			/*
			 * Hashtags implementation - by Joschi
			 */
			status= status.replace(/(#(\w*))/g,'<a target="_blank" href="http://hashtags.org/tag/$2">$1</a>');
    
			return '<p class="pic"><a href="#" onclick="setReply(\'' + user['screen_name'] + '\');"><img src="' + user['profile_image_url'] + '" width="24" height="24" alt="'+user['name']+'" /></a>' +
				   '<p class="what" style="font-size: 120%;">' + user['name'] + '</p>' +
				   '<p class="who">' + status + '<br/>' +
				   '<a target="_blank" href="http://twitter.com/' + user['screen_name'] + '">' + user['screen_name'] + '</a></p>';
		},
	
	// List Updating //
	update_current_list:
		function() {
			$('tweets').setHTML('');
			if((this.currentList == 'public_timeline') || (this.currentList == 'friends_timeline')) {
				var current_tweets = this.current_tweets();
				var tweet_ids = [];
				for(var tid in current_tweets) {
					tweet_ids.push(tid);
				}
				tweet_ids = tweet_ids.sort().reverse();
				for(var i=0; i < tweet_ids.length; i++) {
					var li = new Element('li');
					li.setHTML(this.render_tweet(current_tweets[tweet_ids[i]], li));
					if((i % 2) == 0) {
						li.addClass('even');
					}
					li.injectInside($('tweets'));
				}
			} else if ( this.currentList == 'friends' || this.currentList == 'followers' ) {
				( this.currentList == 'friends' ) ? theurl = 'http://twitter.com/statuses/friends/' + this.username + '.json?lite=true' : theurl = 'http://twitter.com/statuses/followers.json?lite=true';
				var aj = new Ajax( theurl,
								   { headers: Tweetbar.http_headers(),
								   	 onSuccess:
								   	 	function(raw_data) {
											var rsp = Json.evaluate(raw_data);
											var i = 0;
											for ( var user in rsp ) {
												if ( (rsp[user]['screen_name'] != undefined) && (rsp[user]['screen_name'] != 'forEach') ) {
													var li = new Element('li');
													li.setHTML(Tweetbar.render_user(rsp[user]));
													if ( ( i % 2 ) == 0 ) {
														li.addClass('even');
													}
													li.injectInside('tweets');
													i++;
												}
											}
								   	 	},
								   }).request();
			} else if ( this.currentList == 'replies' ) {
				var aj = new Ajax( 'http://twitter.com/statuses/replies.json',
								   { headers: Tweetbar.http_headers(),
								   	 onSuccess:
								   	 	function(raw_data) {
								   	 		var rsp = Json.evaluate(raw_data);
								   	 		var i = 0;
								   	 		for ( var reply in rsp ) {
								   	 			var li = new Element('li');
								   	 			rsp[reply].text = Tweetbar.expand_status(rsp[reply].text);
								   	 			li.setHTML(Tweetbar.render_tweet(rsp[reply]));
								   	 			if ( ( i % 2 ) == 0 ) {
								   	 				li.addClass('even');
								   	 			}
								   	 			li.injectInside('tweets');
								   	 			i++;
								   	 		}
								   	 	}
								   }).request();
			} else if ( this.currentList == 'me' ) {
				var aj = new Ajax( 'http://twitter.com/users/show/' + this.username + '.json',
								   { headers: Tweetbar.http_headers(),
								   	 onSuccess:
								   	 	function(raw_data) {
								   	 		var user = Json.evaluate(raw_data);
								   	 		var tweets = $('tweets');
								   	 		var inner = '<div style="padding-bottom: 10px;">' +
								   	 			'<img src="' + user.profile_image_url + '" alt="' + user.screen_name + '" style="float: right; width: 48px; height: 48px;" />' +
								   	 			'<div style="font-size: 110%;">' + user.name + '</div>' +
								   	 			'<div style="font-size: 0.8em;">' +
								   	 			'<strong>Location</strong>: ' + user.location + '<br/>' +
								   	 			'<strong>Bio</strong>: ' + user.description + '<br/>' +
								   	 			'<strong>Friends</strong>: ' + user.friends_count + '<br/>' +
								   	 			'<strong>Followers</strong>: ' + user.followers_count + '<br/>' +
								   	 			'<strong>Favorites</strong>: ' + user.favourites_count + '<br/>' +
								   	 			'<strong>Updates</strong>: ' + user.statuses_count + '</div>' +
								   	 			'</div>';
								   	 		tweets.setHTML(inner);
								   	 	},
								   }).request();
			}
		},	
	get_tweets:
		function() {
			var panel = Tweetbar.currentList;
			var aj = new Ajax( Tweetbar.api_url_for(panel),
							  { headers: Tweetbar.http_headers(),
								onComplete:
									function(raw_data) {
										Tweetbar.hide_refresh_activity();
										Tweetbar.set_updater();
									},
								onSuccess:
									function(raw_data) {
										Tweetbar.save_tweets(panel, raw_data);
										Tweetbar.update_current_list();
									},
								onFailure:
									function(e) {
										Tweetbar.hide_refresh_activity();
										Tweetbar.set_updater();
									},
								onRequest:
									function() {
										Tweetbar.show_refresh_activity();
										Tweetbar.clear_updater();
									},
							  }).request();
		},
	save_tweets:
		function(panel, response_data) {
			var new_tweets = Json.evaluate(response_data);
			for(var i=0; i < new_tweets.length; i++) {
				if(new_tweets[i].user) {
					var status = Tweetbar.create_status_object(new_tweets[i]);
					if(!this.tweets[panel][status.id]) {
						this.tweets[panel][status.id] = status;
						this.tweets[panel][status.id].user = Tweetbar.create_user_object(new_tweets[i].user);
					}
				} else {
					var user = Tweetbar.create_user_object(new_tweets[i]);
					var status = Tweetbar.create_status_object(new_tweets[i].status);
					var name_key = user.screen_name.toLowerCase();
					if(!this.tweets[panel][name_key] || (this.tweets[panel][name_key].status.id != status.id)) {
						this.tweets[panel][name_key] = status;
						this.tweets[panel][name_key].user = user;
					}
				}
			}
		},
	clear_updater:
		function() {
			if(this.updater) {
				$clear(this.updater);
			}
		},
	set_updater:
		function() {
			this.clear_updater();
			var interval = Tweetbar.prefService.getIntPref('refreshInterval');
			var up_int = parseInt(interval);
			this.updater = this.get_tweets.periodical(up_int);
		},	
	manual_refresh:
		function() {
			this.clear_updater();
			this.get_tweets();
			this.set_updater();
		},
	
	// Refresh //
	show_refresh_activity:
		function() {
			$('refresh_activity').setStyle('display', 'block');
			$('refreshing').setStyle('display', 'inline');
		},
	hide_refresh_activity:
		function() {
			$('refresh_activity').setStyle('display', 'none');
			$('refreshing').setStyle('display', 'none');
		},
		
	// Tweet Actions //	
	fav_tweet:
		function(tweetid) {
			var aj = new Ajax( 'http://twitter.com/favorites/create/' + tweetid + '.json',
							   { headers: Tweetbar.http_headers(),
								 onFailure:
									function(e) {
										alert('TwitKit AJAX Error: '+e);
									},
							   }).request();
		},		
	delete_tweet:
		function(tweetid) {
			var aj = new Ajax( 'http://twitter.com/statuses/destroy/' + tweetid + '.json',
							   { headers: Tweetbar.http_headers(),
							   	onSuccess:
							   		function() {
							   			var slider = new Fx.Slide(tweetid);
							   			slider.toggle();
							   		},
							   	onFailure:
							   		function(e) {
							   			alert('TwitKit AJAX Error: '+e);
							   		},
							   }).request();
		},
	update_status:
		function(status, callback) {
			if(this.isAuthenticated) {
				this.send_tweet(status, callback);
			} else {
				this.authenticate('update');
				this.pendingUpdate = {callback: callback, status: status};
			}
		},		
	send_tweet:
		function(status, callback) {
			var aj = new Ajax( Tweetbar.api_url_for('update'),
							  { headers:  Tweetbar.http_headers(),
								postBody: Object.toQueryString({status: status, source: 'twitkit'}),
								onComplete:
									function(raw_data) {
										callback();
									},
								onSuccess:
									function(raw_data) {
										Tweetbar.save_tweets(this.currentList, raw_data);
										setTimeout('Tweetbar.manual_refresh();', 1000);
									},
								onFailure:
									function(e) {
										alert('Tweetbar AJAX Error: '+e);
									},
							  }).request();
		},
	
	// Panel Functions //
	activate_panel:
		function(name, caller) {
			if(!this.authorization_required_for(name) || this.isAuthenticated) {
				
				this.currentList = name;
				this.update_current_list();
				this.clear_current_tweets();
				
				$('tab_for_public_timeline').removeClass('active');
				$('tab_for_friends_timeline').removeClass('active');
				$('tab_for_friends').removeClass('active');
				$('tab_for_followers').removeClass('active');
				$('tab_for_replies').removeClass('active');
				$('tab_for_me').removeClass('active');
				
				$('tab_for_'+name).addClass('active');
				
				if(caller) {
					caller.blur();
				}
				
				Tweetbar.prefService.setCharPref('active_panel', name);
				
				this.clear_updater();
				this.get_tweets();
				this.set_updater();
			} else {
				this.authenticate(action);
			}
		},
	
	// Styling //
	setListHeight:
		function() {
			var h = Window.getHeight() -
					( $('topper').getSize()['size']['y'] +
					  $('navigation').getSize()['size']['y'] +
					  $('refresher').getSize()['size']['y']
					);
			$('lists').setStyle('overflow', 'auto');
			$('lists').setStyle('height', h+'px');
		},
	
	// Authorization //
	toggle_login:
		function() {
			this.loginSlider.toggle();
		},
	close_login:
		function(obj) {
			this.loginSlider.slideOut();
			
			$('whoami').setHTML('<a href="#" class="signin" onclick="Tweetbar.open_login(this); return false;">sign in!</a>');
			if(obj) {
				obj.blur();
			}
			
			var x = document.getElementById('username');
			x.value = '';
			
			x = document.getElementById('password');
			x.value = '';
		},
	open_login:
		function(obj) {
			this.loginSlider.slideIn();
			
			$('whoami').setHTML('<a href="#" class="signin" onclick="Tweetbar.close_login(this); return false;">close</a>');
			if(obj) {
				obj.blur();
			}
			$('username').focus();
		},
	authorization_required_for:
		function(resource) {
			if(resource == 'public_timeline') {
				return false;
			} else {
				return true;
			}
		},
	authenticate:
		function(action) {
			this.open_login();
			this.pendingAction = action;
		},	
	sign_out:
		function() {
			var aj = new Ajax( 'http://twitter.com/account/end_session',
							   { headers: Tweetbar.http_headers(),
							   	 onSuccess:
							   	 	function() {
										this.username = null;
										this.password = null;
										this.isAuthenticated = false;
										Tweetbar.clear_http_headers();
										Tweetbar.clear_cookies();
										
										$('whoami').setHTML('<a href="#" class="signin" onclick="Tweetbar.open_login(this); return false;">sign in!</a>');
										$('whoami').setStyle('backgroundColor', '#75b7ba');
										$('loginwrap').setStyle('display', 'block');
										Tweetbar.loginSlider.hide();
										if(Tweetbar.authorization_required_for(this.currentList)) {
											Tweetbar.activate_panel('public_timeline');
										}
							   	 	},
							   	onFailure:
							   		function() {
							   			alert('There was an error signing out.');
							   		},
							 }).request();
		},	
	sign_in:
		function(un, pw, callback) {
			this.username = un;
			this.password = pw;
			this.clear_http_headers();
			
			var authr = new Ajax( 'http://twitter.com/account/verify_credentials',
								  { headers: this.http_headers(),
									onComplete:
										function(raw_data) {
											if(this.transport.status == 200) {
												Tweetbar.isAuthenticated = true;
												Tweetbar.prefService.setCharPref('username', Tweetbar.username);
												Tweetbar.prefService.setCharPref('password', Tweetbar.password);
												Tweetbar.close_login();
												if(Tweetbar.pendingAction) {
													if(Tweetbar.pendingAction == 'update') {
														Tweetbar.send_tweet(Tweetbar.pendingUpdate['status'], Tweetbar.pendingUpdate['callback']);
														Tweetbar.pendingAction = null;
														Tweetbar.pendingUpdate = null;
													} else {
														Tweetbar.activate_panel(Tweetbar.pendingAction);
														Tweetbar.pendingAction = null;
													}
												}
												Tweetbar.set_username_on_page();
											} else {
												alert('sign in failed: '+raw_data);
											}
											if(callback) {
												try { callback(); } catch(e) { alert('sign-in callback error: '+e); };
											}
										},
								  }).request();
		},	
	set_username_on_page:
		function() {
			$('whoami').setStyle('backgroundColor', 'transparent');
			$('whoami').setHTML('<p><a href="http://twitter.com/' + Tweetbar.username + '">'+Tweetbar.username+'</a> [<a href="#" onclick="Tweetbar.sign_out(); return false;" alt="sign out" title="sign out">sign out</a>]</p>');
			$('loginwrap').setStyle('display', 'none');
		},
		
};

window.onload = function() {
	Tweetbar.run();
};

window.onresize = function() {
	Tweetbar.setListHeight();
};
