/*
	TwitKit v1.1
	
	Based off of Tweetbar by Mike Demers [mike@mikedemers.net]
	
	homepage:  http://engel.uk.to/twitkit

	Todo:
		* Search (probably via Summize)
			* How should this be orchestrated? With a new tab?
		* improve behavior when twitter is down
		* highlight friends and followers in public timeline
		* add a configurable maximum tweet count
		* add support for multiple accounts
		* direct-messaging support
	*/

/**
 * Tweetbar
 * The main JavaScript class for TwitKit.
 * 
 * @class
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
	/**
	 * run ( )
	 * Initializes TwitKit processes and prepares the
	 * sidebar. This function is essential for TwitKit to
	 * function correctly.
	 * 
	 * @constructor
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	run:
		function () {
			Tweetbar.prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.twitkit.");
			Tweetbar.cookieManager = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager);
			
			// l10n //
			Tweetbar.stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);
			Tweetbar.strings = {
				UI: Tweetbar.stringBundleService.createBundle('chrome://twitkit/locale/ui.properties')
			};
			this.localize();
			
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
			
			this.setListSize();
			
			this.loginSlider = new Fx.Slide('loginform', {duration: 500});
			this.loginSlider.hide();
			
			var initial_panel = '';
			try {
				initial_panel = Tweetbar.prefService.getCharPref('active_panel');
			} catch (e) {
				initial_panel = 'public_timeline';
				Tweetbar.prefService.setCharPref('active_panel', initial_panel);
			}
			
			try {
				Tweetbar.username = Tweetbar.prefService.getCharPref('username');
				Tweetbar.password = Tweetbar.prefService.getCharPref('password');
				Tweetbar.isAuthenticated = true;
				Tweetbar.set_username_on_page();
			} catch (e) { }
			
			this.activate_panel(initial_panel);
		},
	/**
	 * localize ( )
	 * Translates all words in the HTML document to the
	 * user's current locale.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.1
	 */
	localize:
		function () {
			$('.signin').innerHTML = this._('login.signIn');
			$('login-header').innerHTML = this._('login.header');
			$('username-label').innerHTML = this._('login.form.username');
			$('password-label').innerHTML = this._('login.form.password');
			$('loginbutton').setProperty('value', this._('login.form.submit'));
			$('signup').innerHTML = this._('login.signUp', '<a href="http://twitter.com/account/create?tb_10" target="_content">', '</a>');
			$('question').innerHTML = this._('poster.question');
			$('compress').setProperty('title', this._('poster.compress'));
			$('public').innerHTML = this._('tabs.public.title');
			$('user').innerHTML = this._('tabs.user.title');
			$('friends').innerHTML = this._('tabs.friends.title');
			$('followers').innerHTML = this._('tabs.followers.title');
			$('replies').innerHTML = this._('tabs.replies.title');
			$('me').innerHTML = this._('tabs.me.title');
			$('refreshing').innerHTML = this._('misc.refreshing');
			$('refresh').innerHTML = this._('misc.refresh');
			$('clear-link').innerHTML = this._('misc.clear');
			$('loading').innerHTML = this._('misc.loading');
		},
	
	// l10n //
	/**
	 * _ ( label )
	 * Translates a string into the user's current locale.
	 * If one parameter is given, the string is retrieved.
	 * If more than one parameters are given, the string is
	 * formatted with the 2nd, 3rd, 4th parameters, etc.
	 * 
	 * @param {String} label Word to localize
	 * @param {String} [vars=""] (optional) Extra variables
	 * @returns {String} A localized string
	 * @methodOf Tweetbar
	 * @since 1.1
	 */
	_:
		function (label) {
			if ( arguments.length === 1 )
				return Tweetbar.strings.UI.GetStringFromName(label);
			return Tweetbar.strings.UI.formatStringFromName(
				label,
				Array.prototype.slice.call(arguments, 1), arguments.length - 1);
		},
	
	// HTTP Headers //
	/**
	 * clear_http_headers ( )
	 * Reset all HTTP headers (used in logging in/out)
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	clear_http_headers:
		function () {
			Tweetbar.httpHeaders = null;
		},
	/**
	 * http_headers ( )
	 * Return standarad HTTP headers to be sent to Twitter.
	 * 
	 * @returns {Array} An array of HTTP headers.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	http_headers:
		function () {
			if ( !Tweetbar.httpHeaders ) {
				Tweetbar.httpHeaders = {
					'X-Twitter-Client': 'TwitKit',
					'X-Twitter-Client-Version': '1.1',
					'X-Twitter-Client-URL': 'http://engel.uk.to/twitkit/1.1.xml',
				};
				if ( Tweetbar.username && Tweetbar.password ) {
					Tweetbar.httpHeaders['Authorization'] = Tweetbar.http_basic_auth();
				}
			}
			return Tweetbar.httpHeaders;
		},
	/**
	 * http_basic_auth ( )
	 * Return Basic authentication for HTTP headers.
	 * 
	 * @returns {String} Basic authentication string.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	http_basic_auth:
		function () {
			return 'Basic '+btoa(Tweetbar.username+':'+Tweetbar.password);
		},
	
	// Cookies //
	/**
	 * clear_cookies ( )
	 * Clears cookies for twitter.com, to prevent sign-in
	 * problems.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	clear_cookies:
		function () {
			var url = 'HTTP://TWITTER.COM';
			var iter = Tweetbar.cookieManager.enumerator;
			while ( iter.hasMoreElements() ) {
				var cookie = iter.getNext();
				if ( cookie instanceof Components.interfaces.nsICookie ) {
					if ( url.indexOf(cookie.host.toUpperCase()) != -1 ) {
						Tweetbar.cookieManager.remove(cookie.host, cookie.name, cookie.path, cookie.blocked);
					}
				}
			}
		},
	
	// Miscellaneous //
	/**
	 * api_url_for ( resource )
	 * Returns the Twitter API request URL for the specified action.
	 * 
	 * @param {String} resource A valid Twitter API request.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	api_url_for:
		function (resource) {
			return 'http://twitter.com/statuses/' + resource + '.json';
		},
	/**
	 * expand_status ( s )
	 * Make links and replies clickable.
	 * 
	 * @param {String} s Tweet text
	 * @returns {String} Tweet text with clickable links and Twitter names
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	expand_status:
		function (s) {
			return s.toString().replace(/\</,'&lt;').replace(/(https?:\/\/([-\w\.]+)+(:\d+)?(\/([\w\/_\.]*(\?\S+)?)?)?)/g, this.anchor_tag('$1')).replace(/\@([0-9a-z_A-Z]+)/g, this.anchor_tag('http:\/\/twitter.com/$1'.toLowerCase(),'@$1','$1 ' + this._('misc.onTwitter')));
		},
	/**
	 * create_status_object ( obj )
	 * Take a JSON object, parse it for parameters we need, and format them.
	 *
	 * @param {Object} obj A JSON object returned from the Twitter API.
	 * @returns {Object} A filtered and formatted tweet object
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	create_status_object:
		function (obj) {
			return {
				'id': parseInt(obj.id),
				'text': Tweetbar.expand_status(obj.text),
				'created_at': Date.parse(obj.created_at || Date()),
				'source': obj.source,
			}
		},
	/**
	 * create_user_object ( obj )
	 * Take a JSON object containing a user, parse it, and format it.
	 * 
	 * @param {Object} obj A JSON object returned from a 'friends' or 'followers' API request.
	 * @returns {Object} A filtered and formatted user object
	 * @see Tweetbar#create_status_object
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	create_user_object:
		function (obj) {
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
	/**
	 * user_anchor_tag ( user, text )
	 * Link a username to its Twitter profile.
	 * 
	 * @param {String} user A user object returned from Tweetbar#create_user_object.
	 * @param {String} [text="$username"] The text to show in the link. Username by default.
	 * @returns {String} A linked tag.
	 * @see Tweetbar#create_user_object
	 * @see Tweetbar#anchor_tag
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	user_anchor_tag:
		function (user, text) {
			var name;
			( Tweetbar.prefService.getCharPref('showNamesAs') == 'screennames' ) ? name = user['screen_name'] : name = user['name'];
			return this.anchor_tag('http://twitter.com/' + user['screen_name'],
									( (text) ? text : name),
									user['name'] + ' in ' + user['location']);
		},
	/**
	 * anchor_tag ( url, text, title )
	 * Anchor a tag.
	 * 
	 * @param {String} url The URL to link to.
	 * @param {String} [text=""] The text to anchor.
	 * @param {String} [title=""] Title to use (text displayed when link is hovered over).
	 * @returns {String} An anchored tag.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	anchor_tag:
		function (url, text, title) {
			return '<a href="'+url+'" target="_blank" title="' +
					( (title) ? title : '') +'" alt="'+
					( (title) ? title : '') +'">'+
					( (text) ? text : url ) + '</a>';
		},
	/**
	 * relative_time_string ( time_value )
	 * Convert a date returned from Twitter API requests to a relative time string.
	 * 
	 * @param {String} time_value A date returned from Twitter API requests
	 * @returns {String} Relative time string
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	relative_time_string:
		function (time_value) {
		   var delta = parseInt(((new Date).getTime() - time_value) / 1000);
		   
		   if ( delta < 60 ) {
			   return 'less than a minute ago';
		   } else if ( delta < 120 ) {
			   return 'about a minute ago';
		   } else if ( delta < ( 45*60 ) ) {
			   return ( parseInt(delta / 60) ).toString() + ' minutes ago';
		   } else if ( delta < ( 90*60 ) ) {
			   return 'about an hour ago';
		   } else if ( delta < ( 24*60*60 ) ) {
			   return 'about ' + ( parseInt(delta / 3600) ).toString() + ' hours ago';
		   } else if ( delta < ( 48*60*60 ) ) {
			   return '1 day ago';
		   } else {
			   return ( parseInt(delta / 86400) ).toString() + ' days ago';
		   }
		},
	
	// Misc. Tweet Functions //
	/**
	 * current_tweets ( )
	 * This is a shorthand method of retrieving the tweets currently being displayed.
	 * 
	 * @returns {Object} An object filled with tweets
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	current_tweets:
		function () {
			return this.tweets[this.currentList];
		},
	/**
	 * clear_current_tweets ( )
	 * Clear tweets from the current panel.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	clear_current_tweets:
		function () {
			var panel = this.currentList;
			
			for ( var tweet in this.tweets[panel] ) {
				if ( this.tweets[panel][tweet]._b ) {
					delete this.tweets[panel][tweet];
				}
			}
			this.update_current_list();
		},
	
	// URL Compression //
	/**
	 * compress_url ( )
	 * 
	 * @description Replaces a long URL in the status box with a URL compressed by is.gd
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	compress_url:
		function () {
			var selection = document.getElementById('status').value.substring(document.getElementById('status').selectionStart, document.getElementById('status').selectionEnd);
			if ( selection.length == 0 ) {
				return;
			}
			var url = "http://is.gd/api.php?longurl="+selection;
			var aj = new Ajax( url,
							   { method: 'get',
							     onSuccess:
							     	function (replaced) {
										var selection = document.getElementById('status').value.substring(document.getElementById('status').selectionStart, document.getElementById('status').selectionEnd);
										var text = document.getElementById('status').value.substring(0,document.getElementById('status').selectionStart) + replaced + (selection.length==selection.trim().length?"":" ")+ document.getElementById('status').value.substring(document.getElementById('status').selectionEnd);  
										document.getElementById('status').value=text;
									},
							   }).request();
		},
	
	// Rendering //
	/**
	 * render_tweet ( )
	 * Render a tweet (but don't print it).
	 * 
	 * @param {Object} tweet A tweet object returned by Tweetbar#create_status_object.
	 * @param {Object} li A MooTools Element object of a 'li' element.
	 * @returns {String} Fully-rendered tweet HTML.
	 * @see Tweetbar#create_status_object
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	render_tweet:
		function (tweet, li) {
			var display_date = '';
			if ( tweet ) {
				if( !tweet._a ) {
					tweet._a = true;
				} else if ( !tweet._b ) {
					tweet._b = true;
				}
				if ( this.currentList != 'replies' ) { li.setProperty('id', tweet.id); }
				var user_image = '';
				if ( tweet.user && tweet.user.profile_image_url ) {
					user_image = '<img src="' + tweet.user.profile_image_url +
								 '" width="24" height="24" alt="'+tweet.user.name+'" />';
				}
				var tsource = tweet.source;
				tsource = tsource.replace(/<a /, '<a target="_blank" ');
				( Tweetbar.prefService.getBoolPref('showAppSource') ) ? source = '<div class="source">' + this._('misc.from') + ' ' + tsource + '</div>' : source = '';
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
	/**
	 * render_user ( user )
	 * Render a user (but don't print it).
	 * 
	 * @param {Object} user A user object returned by Tweetbar#create_user_object.
	 * @returns {String} Fully-rendered user HTML.
	 * @see Tweetbar#create_user_object
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	render_user:
		function (user) {
			status = user.status.text;
			if ( user.protected == true ) {
				status = '<em>' + this._('tabs.friends.protected') + '</em>';
			} else {
				/*
				 * Hashtags implementation - by Joschi
				 */
				status = Tweetbar.expand_status(status);
				status = status.replace(/(#(\w*))/g,'<a target="_blank" href="http://hashtags.org/tag/$2">$1</a>');
			}
    
			return '<p class="pic"><a href="#" onclick="setReply(\'' + user['screen_name'] + '\');"><img src="' + user['profile_image_url'] + '" width="24" height="24" alt="'+user['name']+'" /></a>' +
				   '<p class="what" style="font-size: 120%;">' + user['name'] + '</p>' +
				   '<p class="who">' + status + '<br/>' +
				   '<a target="_blank" href="http://twitter.com/' + user['screen_name'] + '">' + user['screen_name'] + '</a></p>';
		},
	
	// List Updating //
	/**
	 * update_current_list ( )
	 * Update the current list of tweets (print it).
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	update_current_list:
		function () {
			$('tweets').setHTML('');
			if( ( this.currentList == 'public_timeline' ) || ( this.currentList == 'friends_timeline' ) ) {
				var current_tweets = this.current_tweets();
				var tweet_ids = [];
				for ( var tid in current_tweets ) {
					tweet_ids.push(tid);
				}
				tweet_ids = tweet_ids.sort().reverse();
				for ( var i=0; i < tweet_ids.length; i++ ) {
					var li = new Element('li');
					li.setHTML(this.render_tweet(current_tweets[tweet_ids[i]], li));
					if ( ( i % 2 ) == 0 ) {
						li.addClass('even');
					}
					if ( Tweetbar.username && current_tweets[tweet_ids[i]].text.search('@' + Tweetbar.username) !== -1 ) {
						li.addClass('reply');
					}
					li.injectInside($('tweets'));
				}
			} else if ( this.currentList == 'friends' || this.currentList == 'followers' ) {
				( this.currentList == 'friends' ) ? theurl = 'http://twitter.com/statuses/friends/' + this.username + '.json?lite=true' : theurl = 'http://twitter.com/statuses/followers.json?lite=true';
				var aj = new Ajax( theurl,
								   { headers: Tweetbar.http_headers(),
								   	 onSuccess:
								   	 	function (raw_data) {
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
								   	 	function (raw_data) {
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
								   	 	function (raw_data) {
								   	 		var user = Json.evaluate(raw_data);
								   	 		var tweets = $('tweets');
								   	 		var inner = '<div style="padding-bottom: 10px;">' +
								   	 			'<img src="' + user.profile_image_url + '" alt="' + user.screen_name + '" style="float: right; width: 48px; height: 48px;" />' +
								   	 			'<div style="font-size: 110%;">' + user.name + '</div>' +
								   	 			'<div style="font-size: 0.8em;">' +
								   	 			'<strong>' + Tweetbar._('tabs.me.location') + '</strong>: ' + user.location + '<br/>' +
								   	 			'<strong>' + Tweetbar._('tabs.me.bio') + '</strong>: ' + Tweetbar.expand_status(user.description) + '<br/>' +
								   	 			'<strong>' + Tweetbar._('tabs.me.friends') + '</strong>: ' + user.friends_count + '<br/>' +
								   	 			'<strong>' + Tweetbar._('tabs.me.followers') + '</strong>: ' + user.followers_count + '<br/>' +
								   	 			'<strong>' + Tweetbar._('tabs.me.favorites') + '</strong>: ' + user.favourites_count + '<br/>' +
								   	 			'<strong>' + Tweetbar._('tabs.me.updates') + '</strong>: ' + user.statuses_count + '</div>' +
								   	 			'</div>';
								   	 		tweets.setHTML(inner);
								   	 	},
								   }).request();
			}
		},
	/**
	 * get_tweets ( )
	 * Retrieve tweets from Twitter.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	get_tweets:
		function () {
			var panel = Tweetbar.currentList;
			var aj = new Ajax( Tweetbar.api_url_for(panel),
							  { headers: Tweetbar.http_headers(),
								onComplete:
									function (raw_data) {
										Tweetbar.hide_refresh_activity();
										Tweetbar.set_updater();
									},
								onSuccess:
									function (raw_data) {
										Tweetbar.save_tweets(panel, raw_data);
										Tweetbar.update_current_list();
									},
								onFailure:
									function (e) {
										Tweetbar.hide_refresh_activity();
										Tweetbar.set_updater();
									},
								onRequest:
									function () {
										Tweetbar.show_refresh_activity();
										Tweetbar.clear_updater();
									},
							  }).request();
		},
	/**
	 * save_tweets ( panel, response_data )
	 * Save the fresh tweets to the current panel's registry.
	 * 
	 * @param {String} panel The name of the current panel.
	 * @param {Object} response_data Raw JSON response data from a Twitter API request.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	save_tweets:
		function (panel, response_data) {
			var new_tweets = Json.evaluate(response_data);
			for ( var i=0; i < new_tweets.length; i++ ) {
				if ( new_tweets[i].user ) {
					var status = Tweetbar.create_status_object(new_tweets[i]);
					if ( !this.tweets[panel][status.id] ) {
						this.tweets[panel][status.id] = status;
						this.tweets[panel][status.id].user = Tweetbar.create_user_object(new_tweets[i].user);
					}
				} else {
					var user = Tweetbar.create_user_object(new_tweets[i]);
					var status = Tweetbar.create_status_object(new_tweets[i].status);
					var name_key = user.screen_name.toLowerCase();
					if ( !this.tweets[panel][name_key] || ( this.tweets[panel][name_key].status.id != status.id ) ) {
						this.tweets[panel][name_key] = status;
						this.tweets[panel][name_key].user = user;
					}
				}
			}
		},
	/**
	 * clear_updater ( )
	 * Stop periodical updates.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	clear_updater:
		function () {
			if(this.updater) {
				$clear(this.updater);
			}
		},
	/**
	 * set_updater ( )
	 * Reset (or start for the first time) periodical updates.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	set_updater:
		function () {
			this.clear_updater();
			var interval = Tweetbar.prefService.getIntPref('refreshInterval');
			var up_int = parseInt(interval);
			this.updater = this.get_tweets.periodical(up_int);
		},
	/**
	 * manual_refresh ( )
	 * Refresh the current panel, regardless of the periodical updater. Used when user manually clicks 'refresh'.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	manual_refresh:
		function () {
			this.clear_updater();
			this.get_tweets();
			this.set_updater();
		},
	
	// Refresh //
	/**
	 * show_refresh_activity ( )
	 * Show the refresher label and icon.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	show_refresh_activity:
		function () {
			$('refresh_activity').setStyle('display', 'block');
			$('refreshing').setStyle('display', 'inline');
		},
	/**
	 * hide_refresh_activity ( )
	 * Hide the refresher label and icon.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	hide_refresh_activity:
		function () {
			$('refresh_activity').setStyle('display', 'none');
			$('refreshing').setStyle('display', 'none');
		},
	
	// Tweet Actions //	
	/**
	 * fav_tweet ( tweetid )
	 * Add a tweet to the user's favorites.
	 * 
	 * @param {String} tweetid The ID of the tweet to add to favorites.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	fav_tweet:
		function (tweetid) {
			var aj = new Ajax( 'http://twitter.com/favorites/create/' + tweetid + '.json',
							   { headers: Tweetbar.http_headers(),
								 onFailure:
									function (e) {
										alert(this._('errors.ajax')+e);
									},
							   }).request();
		},
	/**
	 * delete_tweet ( tweetid )
	 * Delete one of the user's tweets.
	 * 
	 * @param {String} tweetid The ID of the tweet to delete. The user MUST own this tweet.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	delete_tweet:
		function (tweetid) {
			var aj = new Ajax( 'http://twitter.com/statuses/destroy/' + tweetid + '.json',
							   { headers: Tweetbar.http_headers(),
							   	onSuccess:
							   		function () {
							   			var slider = new Fx.Slide(tweetid);
							   			slider.toggle();
							   		},
							   	onFailure:
							   		function (e) {
							   			alert(this._('errors.ajax')+e);
							   		},
							   }).request();
		},
	/**
	 * update_status ( )
	 * Umbrella function for updating the user's status -
	 * does some authentication checking and then runs the
	 * actual update function, Tweetbar#send_tweet.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	update_status:
		function (status, callback) {
			if ( this.isAuthenticated ) {
				this.send_tweet(status, callback);
			} else {
				this.authenticate('update');
				this.pendingUpdate = {callback: callback, status: status};
			}
		},
	/**
	 * send_tweet ( status, callback )
	 * Send a status update to Twitter.
	 * 
	 * @param {String} status Status to send to Twitter
	 * @param {Function} [callback=""] Function to run after the tweet is successfully sent
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	send_tweet:
		function (status, callback) {
			var aj = new Ajax( Tweetbar.api_url_for('update'),
							  { headers:  Tweetbar.http_headers(),
								postBody: Object.toQueryString({status: status, source: 'twitkit'}),
								onComplete:
									function (raw_data) {
										callback();
									},
								onSuccess:
									function (raw_data) {
										Tweetbar.save_tweets(this.currentList, raw_data);
										setTimeout('Tweetbar.manual_refresh();', 1000);
									},
								onFailure:
									function (e) {
										alert(this._('errors.ajax')+e);
									},
							  }).request();
		},
	
	// Panel Functions //
	/**
	 * activate_panel ( name, caller )
	 * Switch to a new panel.
	 * 
	 * @param {String} name The name of the panel to switch to.
	 * @param {Object} [caller=""] A DOM object from where the function was called.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	activate_panel:
		function (name, caller) {
			if ( !this.authorization_required_for(name) || this.isAuthenticated ) {
				
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
				
				if ( caller ) {
					caller.blur();
				}
				
				Tweetbar.prefService.setCharPref('active_panel', name);
				
				this.clear_updater();
				this.get_tweets();
				this.set_updater();
			} else {
				alert(this._('misc.needAuth'));
				this.authenticate(action);
			}
		},
	
	// Styling //
	/**
	 * setListSize ( )
	 * Adjust the list of tweets to fit Firefox's current window size.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	setListSize:
		function () {
			var h = Window.getHeight() -
					( $('topper').getSize()['size']['y'] +
					  $('navigation').getSize()['size']['y'] +
					  $('refresher').getSize()['size']['y']
					);
			$('lists').setStyle('overflow', 'auto');
			$('lists').setStyle('height', h+'px');
			var w = Window.getWidth() + 15;
			$('tweets').setStyle('max-width', w+'px');
		},
	
	// Authorization //
	/**
	 * toggle_login ( )
	 * Toggle the display of the login window.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	toggle_login:
		function () {
			this.loginSlider.toggle();
		},
	/**
	 * close_login ( obj )
	 * Close the login window.
	 * 
	 * @param {Object} [obj=""] A DOM object from where the function was called.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	close_login:
		function (obj) {
			this.loginSlider.slideOut();
			
			$('whoami').setHTML('<a href="#" class="signin" onclick="Tweetbar.open_login(this); return false;">' + this._('login.signIn') + '</a>');
			if ( obj ) {
				obj.blur();
			}
			
			var x = document.getElementById('username');
			x.value = '';
			
			x = document.getElementById('password');
			x.value = '';
		},
	/**
	 * open_login ( obj )
	 * Open the login window.
	 * 
	 * @param {Object} [obj=""] A DOM object from where the function was called.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	open_login:
		function (obj) {
			this.loginSlider.slideIn();
			
			$('whoami').setHTML('<a href="#" class="signin" onclick="Tweetbar.close_login(this); return false;">' + this._('login.close') + '</a>');
			if ( obj ) {
				obj.blur();
			}
			$('username').focus();
		},
	/**
	 * authorization_required_for ( resource )
	 * Check if authorization is required to make a certain
	 * API request.
	 * 
	 * @param {String} resource The name of the API request.
	 * @return {Boolean}
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	authorization_required_for:
		function (resource) {
			if ( resource == 'public_timeline' ) {
				return false;
			} else {
				return true;
			}
		},
	/**
	 * authenticate ( action )
	 * Have the user log in, and then perform an action.
	 * 
	 * @param {String} action An action (API request) to perform.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	authenticate:
		function (action) {
			this.open_login();
			this.pendingAction = action;
		},
	/**
	 * sign_out ( )
	 * Sign out of the current Twitter account.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	sign_out:
		function () {
			var aj = new Ajax( 'http://twitter.com/account/end_session',
							   { headers: Tweetbar.http_headers(),
							   	 onSuccess:
							   	 	function () {
										this.username = null;
										this.password = null;
										Tweetbar.prefService.setCharPref('username', '');
										Tweetbar.prefService.setCharPref('password', '');
										this.isAuthenticated = false;
										Tweetbar.clear_http_headers();
										Tweetbar.clear_cookies();
										
										$('whoami').setHTML('<a href="#" class="signin" onclick="Tweetbar.open_login(this); return false;">' + Tweetbar._('login.signIn') + '</a>');
										$('whoami').setStyle('backgroundColor', '#75b7ba');
										$('loginwrap').setStyle('display', 'block');
										Tweetbar.loginSlider.hide();
										if ( Tweetbar.authorization_required_for(this.currentList) ) {
											Tweetbar.activate_panel('public_timeline');
										}
							   	 	},
							   	onFailure:
							   		function () {
							   			alert(this._('errors.signOut'));
							   		},
							 }).request();
		},
	/**
	 * sign_in ( un, pw, callback )
	 * Sign in to a Twitter account.
	 * 
	 * @param {String} un Twitter username
	 * @param {String} pw Twitter password
	 * @param {Function} [callback=""] A function to call once the action has completed successfully.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	sign_in:
		function (un, pw, callback) {
			this.username = un;
			this.password = pw;
			this.clear_http_headers();
			
			var authr = new Ajax( 'http://twitter.com/account/verify_credentials',
								  { headers: this.http_headers(),
									onComplete:
										function (raw_data) {
											if ( this.transport.status == 200 ) {
												Tweetbar.isAuthenticated = true;
												Tweetbar.prefService.setCharPref('username', Tweetbar.username);
												Tweetbar.prefService.setCharPref('password', Tweetbar.password);
												Tweetbar.close_login();
												if ( Tweetbar.pendingAction ) {
													if ( Tweetbar.pendingAction == 'update' ) {
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
												alert(this._('errors.signOut'));
											}
											if(callback) {
												try { callback(); } catch(e) { };
											}
										},
								  }).request();
		},
	/**
	 * set_username_on_page ( )
	 * Show the current user's name and a sign-out button
	 * after signing in.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	set_username_on_page:
		function () {
			$('whoami').setStyle('backgroundColor', 'transparent');
			$('whoami').setHTML('<p><a href="http://twitter.com/' + Tweetbar.username + '">'+Tweetbar.username+'</a> [<a href="#" onclick="Tweetbar.sign_out(); return false;" alt="sign out" title="sign out">' + this._('login.signOut') + '</a>]</p>');
			$('loginwrap').setStyle('display', 'none');
		},
	
};

window.onload = function () {
	Tweetbar.run();
};

window.onresize = function () {
	Tweetbar.setListSize();
};
