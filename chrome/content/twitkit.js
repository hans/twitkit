/*
	TwitKit v1.3
	
	Based off of Tweetbar by Mike Demers [mike@mikedemers.net]
	
	homepage:  http://engel.uk.to/twitkit
*/

/**
 * The main JavaScript class for TwitKit.
 * 
 * @class
 * @requires MooTools
 * @version 1.3
 */
var Tweetbar = {
	
	// Variables //
	/**
	 * Tweets for each panel are stored here
	 */
	tweets: {
		friends: {},
		followers: {},
		public_timeline: {},
		friends_timeline: {},
		replies: {},
		direct_messages: {},
		me: {},
	},
	/**
	 * Used for parsing Twitter's created_at API property later on
	 */
	month_names: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
	/**
	 * User is(n't) authenticated
	 */
	isAuthenticated: false,
	/**
	 * The current list being viewed
	 */
	currentList: null,
	/**
	 * Stores the updater object created by MooTools periodical() function
	 */
	updater: null,
	/**
	 * The MooTools Fx object responsible for showing/hiding the login window
	 */
	loginSlider: null,
	/**
	 * The current user's Twitter username
	 */
	username: null,
	/**
	 * The current user's Twitter password
	 */
	password: null,
	/**
	 * If we're waiting for the user to log in to do something, the action that
	 * will be performed is stored here.
	 */
	pendingAction: null,
	/**
	 * Cached HTTP headers to send with API requests
	 */
	httpHeaders: null,
	/**
	 * The service responsible for retrieving and setting preferences
	 */
	prefService: null,
	/**
	 * Service which reads/writes cookies
	 */
	cookieService: null,
	/**
	 * Service that retrieves localized strings
	 */
	stringBundleService: null,
	/**
	 * Shorthand way of accessing Tweetbar.stringBundleService
	 */
	strings: null,
	
	// Startup Functions //
	/**
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
			Tweetbar.cookieService = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager);
			
			// l10n //
			Tweetbar.stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);
			Tweetbar.strings = {
				UI: Tweetbar.stringBundleService.createBundle('chrome://twitkit/locale/ui.properties')
			};
			this.localize();

			// Markdown //
			Tweetbar.markDown = new Showdown.converter();
			
			// Docking //
			var url = window.location.href;
			if ( url.search('undocked') !== -1 ) {
				$('is-undocked').remove();
			}
			
			Tweetbar.DOMWindow = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
				.getInterface(Components.interfaces.nsIWebNavigation)
				.QueryInterface(Components.interfaces.nsIDocShellTreeItem)
				.rootTreeItem
				.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
				.getInterface(Components.interfaces.nsIDOMWindow);
			
			var scheme = Tweetbar.prefService.getCharPref('colorScheme').toLowerCase();
			var link = new Element('link');
			link.setProperties({
				'rel': 'stylesheet',
				'href': 'chrome://twitkit/skin/themes/' + scheme + '.css',
				'type': 'text/css',
				'media': 'screen',
			});
			link.injectInside('thehead');
			
			$('thebody').setStyle('font-size', Tweetbar.prefService.getCharPref('fontSize') + '%');
			
			this.setListSize();
			
			this.loginSlider = new Fx.Slide('loginform', {duration: 500});
			this.loginSlider.hide();

			( Tweetbar.prefService.getBoolPref('secureConnection') ) ? Tweetbar.protocol = 'https' : Tweetbar.protocol = 'http';
			
			if ( Tweetbar.protocol == 'https' )
				$('using-ssl').setProperty('src', 'chrome://twitkit/skin/images/ssl-on.png');
			else
				$('using-ssl').setProperty('src', 'chrome://twitkit/skin/images/ssl-off.png');
			
			var initial_panel = Tweetbar.prefService.getCharPref('active_panel');
			if ( initial_panel == '' )
				initial_panel = 'public_timeline';
			
			try {
				Tweetbar.username = Tweetbar.prefService.getCharPref('username');
				Tweetbar.password = Tweetbar.prefService.getCharPref('password');
				if ( Tweetbar.username !== '' && Tweetbar.password !== '' ) {
					Tweetbar.isAuthenticated = true;
					Tweetbar.set_username_on_page();
				} else {
					Tweetbar.username = null;
					Tweetbar.password = null;
				}
			} catch (e) { }
			
			this.activate_panel(initial_panel);
		},
	/**
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
			$('signup').innerHTML = this._('login.signUp', '<a href="' + Tweetbar.protocol + '://twitter.com/account/create?tb_10" target="_content">', '</a>');
			$('question').innerHTML = this._('poster.question');
			$('compress').setProperty('title', this._('poster.compress'));
			$('public').innerHTML = this._('tabs.public.title');
			$('user').innerHTML = this._('tabs.user.title');
			$('friends').innerHTML = this._('tabs.friends.title');
			$('followers').innerHTML = this._('tabs.followers.title');
			$('replies').innerHTML = this._('tabs.replies.title');
			$('direct-messages').innerHTML = this._('tabs.directMessages.title');
			$('me').innerHTML = this._('tabs.me.title');
			$('refreshing').innerHTML = this._('misc.refreshing');
			$('refresh').innerHTML = this._('misc.refresh');
			$('clear-link').innerHTML = this._('misc.clear');
			$('loading').innerHTML = this._('misc.loading');
		},
	
	// l10n //
	/**
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
			if ( arguments.length === 1 ) {
				try {
					return Tweetbar.strings.UI.GetStringFromName(label);
				} catch (e) {
					return label;
				}
			}
			return Tweetbar.strings.UI.formatStringFromName(label,
				Array.prototype.slice.call(arguments, 1),
				arguments.length - 1);
		},
	
	// HTTP Headers //
	/**
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
					'X-Twitter-Client-Version': '1.3',
					'X-Twitter-Client-URL': 'http://engel.uk.to/twitkit/1.3.xml',
				};
				if ( Tweetbar.username && Tweetbar.password )
					Tweetbar.httpHeaders['Authorization'] = Tweetbar.http_basic_auth();
			}
			return Tweetbar.httpHeaders;
		},
	/**
	 * Return Basic authentication for HTTP headers.
	 * 
	 * @returns {String} Basic authentication string.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	http_basic_auth:
		function () {
			return 'Basic ' + btoa(Tweetbar.username + ':' + Tweetbar.password);
		},
	
	// Cookies //
	/**
	 * Clears cookies for twitter.com, to prevent sign-in
	 * problems.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	clear_cookies:
		function () {
			var url = 'HTTP://TWITTER.COM';
			var iter = Tweetbar.cookieService.enumerator;
			while ( iter.hasMoreElements() ) {
				var cookie = iter.getNext();
				if ( cookie instanceof Components.interfaces.nsICookie ) {
					if ( url.indexOf(cookie.host.toUpperCase()) != -1 )
						Tweetbar.cookieService.remove(cookie.host, cookie.name, cookie.path, cookie.blocked);
				}
			}
		},
	
	// Miscellaneous //
	/**
	 * Returns the Twitter API request URL for the specified action.
	 * 
	 * @param {String} resource A valid Twitter API request.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	api_url_for_statuses:
		function (resource) {
			return Tweetbar.protocol + '://twitter.com/statuses/' + resource + '.json';
		},
	api_url_for_nonstatuses:
		function (resource) {
			return Tweetbar.protocol + '://twitter.com/' + resource + '.json';
		},
	/**
	 * Make links and replies clickable.
	 * 
	 * @param {String} s Tweet text
	 * @returns {String} Tweet text with clickable links and Twitter names
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	expand_status:
		function (s) {
			ret = s.toString();
			ret = ret.replace(/\</,'&lt;');
			re = new RegExp('http:\/\/(www\.|)twitpic\.com\/([a-zA-Z0-9]+)([?()!).,\\s]|<|$)', 'g');
			ret = ret.replace(re, '<a rel="twitpic_gm" href="tkavoidurl://twitpic.com/$2" target="_blank"><img style="border: 1px solid #ccc; float: left; margin: 0 3px 3px 0; height: 72px; width: 72px;" src="tkavoidurl://twitpic.com/show/thumb/$2" border="0" /></a>$3');
			re = new RegExp('(<\\w+.*?>|[^=!:\'"/]|^|)((?:https?:\/\/)|(?:irc:\/\/)|(?:www\.){4})([-\\w]+(?:\.[-\\w]+)*(?::\\d+)?(?:/(?:(?:[~\\w\\+#%-]|(?:[,.;@:][^\\s$]))+)?)*(?:\\?[\\w\\+%&=.;:-]+)?(?:\#[\\w\-\.]*)?)([?()!).,\\s]|<|$)', 'gi');
			ret = ret.replace(re, '$1' + this.anchor_tag('$2$3') + '$4');
			re = new RegExp('tkavoidurl://', 'g');
			ret = ret.replace(re, 'http://');
			ret = ret.replace(/<a href="www/g, '<a href="http:\/\/www');
			ret = ret.replace(/<a href="(\S+) ([^<>]+)" target(.+)>(\S+) ([^<]+)<\/a>/, '<a href="$1" target$3>$1</a> $5');
			ret = ret.replace(/([\w-]+)@([\w-]+\.)([\w-]+)/, this.anchor_tag('mailto:$1&#64;$2$3', '$1&#64;$2$3'));
			ret = ret.replace(/(\s|^)\@([0-9a-z_A-Z]+)/g, this.anchor_tag(Tweetbar.protocol + ':\/\/twitter.com/$2'.toLowerCase(),'$1@$2','$2 ' + this._('misc.onTwitter')));
			return ret;
		},
	/**
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
				'favorited': obj.favorited,
				'truncated': obj.truncated,
				'reply_id': parseInt(obj.in_reply_to_status_id)
			}
		},
	/**
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
			return this.anchor_tag(Tweetbar.protocol + '://twitter.com/' + user['screen_name'],
				( (text) ? text : name),
				user['name'] + ' in ' + user['location']);
		},
	/**
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
		   
			if ( delta < 60 )
				return 'less than a minute ago';
			else if ( delta < 120 )
				return 'about a minute ago';
			else if ( delta < ( 45*60 ) )
				return ( parseInt(delta / 60) ).toString() + ' minutes ago';
			else if ( delta < ( 90*60 ) )
				return 'about an hour ago';
			else if ( delta < ( 24*60*60 ) )
				return 'about ' + ( parseInt(delta / 3600) ).toString() + ' hours ago';
			else if ( delta < ( 48*60*60 ) )
				return '1 day ago';
			else
				return ( parseInt(delta / 86400) ).toString() + ' days ago';
		},
	
	// Misc. Tweet Functions //
	/**
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
	 * Clear tweets from the current panel.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	clear_current_tweets:
		function () {
			var panel = this.currentList;
			
			for ( var tweet in this.tweets[panel] ) {
				if ( this.tweets[panel][tweet]._b )
					delete this.tweets[panel][tweet];
			}
			this.update_current_list();
		},
	
	// URL Compression //
	/**
	 * Replaces a long URL in the status box with a URL compressed by is.gd
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	compress_url:
		function () {
			var selection = document.getElementById('status').value.substring(document.getElementById('status').selectionStart, document.getElementById('status').selectionEnd);
			if ( selection.length == 0 )
				return;
			var shortener_service = Tweetbar.prefService.getCharPref('shortenerService').toLowerCase();
			if ( shortener_service == 'is.gd' ) {
				var shortener_url = "http://is.gd/api.php?longurl=";
				var url = shortener_url+escape(selection);
				var aj = new Ajax( url, {
					method: 'get',
					postBody: {},
					onSuccess:
						function (replaced) {
							var selection = document.getElementById('status').value.substring(document.getElementById('status').selectionStart, document.getElementById('status').selectionEnd);
							var text = document.getElementById('status').value
								.substring(0, document.getElementById('status').selectionStart) + replaced +
								( selection.length == selection.trim().length ? "" : " " ) +
								document.getElementById('status').value.substring(document.getElementById('status').selectionEnd);  
							document.getElementById('status').value = text;
						}
				}).request();
			} else if ( shortener_service == 'bit.ly' ) {
				var shortener_url = "http://api.bit.ly/shorten?version=2.0.1&longUrl=";
				var extra_bits = "&login=alanrice38181&apiKey=R_10186c964026f2d848ed3ca19e797ef6";
				var url = shortener_url+escape(selection)+extra_bits;
				var aj = new Ajax( url, {
					method: 'get',
					postBody: {},
					onSuccess:
						function (raw_data) {
							var results = Json.evaluate(raw_data);
							var i = 0;
							for ( var shortUrl in results ) {
								var selection = document.getElementById('status').value.substring(document.getElementById('status').selectionStart, document.getElementById('status').selectionEnd);
								var text = document.getElementById('status').value
									.substring(0, document.getElementById('status').selectionStart) + shortUrl +
									( selection.length == selection.trim().length ? "" : " " ) +
									document.getElementById('status').value.substring(document.getElementById('status').selectionEnd);  
								document.getElementById('status').value = text;
							}
						}
				}).request();
			} else if ( shortener_service == 'tinyurl' ) {
				var shortener_url = "http://tinyurl.com/api-create.php?url=";
				var url = shortener_url+escape(selection);
				var aj = new Ajax( url, {
					method: 'get',
					postBody: {},
					onSuccess:
						function (replaced) {
							var selection = document.getElementById('status').value.substring(document.getElementById('status').selectionStart, document.getElementById('status').selectionEnd);
							var text = document.getElementById('status').value
								.substring(0, document.getElementById('status').selectionStart) + replaced +
								( selection.length == selection.trim().length ? "" : " " ) +
								document.getElementById('status').value.substring(document.getElementById('status').selectionEnd);  
							document.getElementById('status').value = text;
						}
				}).request();
			} else if ( shortener_service == 'tr.im' ) {
				var shortener_url = "http://tr.im/api/trim_simple?url=";
				var url = shortener_url+escape(selection);
				var aj = new Ajax( url, {
					method: 'get',
					postBody: {},
					onSuccess:
						function (replaced) {
							var selection = document.getElementById('status').value.substring(document.getElementById('status').selectionStart, document.getElementById('status').selectionEnd);
							var text = document.getElementById('status').value
								.substring(0, document.getElementById('status').selectionStart) + replaced +
								( selection.length == selection.trim().length ? "" : " " ) +
								document.getElementById('status').value.substring(document.getElementById('status').selectionEnd);  
							document.getElementById('status').value = text;
						}
				}).request();
			} else if ( shortener_service == 'xrl.us' ) {
				var shortener_url = "http://metamark.net/api/rest/simple?long_url=";
				var url = shortener_url+escape(selection);
				var aj = new Ajax( url, {
					method: 'get',
					postBody: {},
					onSuccess:
						function (replaced) {
							var selection = document.getElementById('status').value.substring(document.getElementById('status').selectionStart, document.getElementById('status').selectionEnd);
							var text = document.getElementById('status').value
								.substring(0, document.getElementById('status').selectionStart) + replaced +
								( selection.length == selection.trim().length ? "" : " " ) +
								document.getElementById('status').value.substring(document.getElementById('status').selectionEnd);  
							document.getElementById('status').value = text;
						}
				}).request();
			}
		},
	
	// Rendering //
	/**
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
				if ( !tweet._a )
					tweet._a = true;
				else if ( !tweet._b )
					tweet._b = true;
				if ( this.currentList != 'replies' )
					li.setProperty('id', tweet.id);
				
				var user_image = '';
				if ( tweet.user && tweet.user.profile_image_url )
					user_image = '<img src="' + tweet.user.profile_image_url + '" width="24" height="24" alt="' + tweet.user.name + '" />';
				
				var tsource = tweet.source.replace(/<a /, '<a target="_blank" ');
				
				( Tweetbar.prefService.getBoolPref('showAppSource') ) ? source = '<div class="source">' + this._('misc.from') + ' ' + tsource + '</div>' : source = '';
				
				( tweet.user.screen_name == Tweetbar.username ) ? dellink = '<a href="#" onclick="Tweetbar.delete_tweet(\'' + tweet.id + '\');"><img style="border: none; float: right;" src="chrome://twitkit/skin/images/delete.png" alt="" /></a>' : dellink = '';
				
				( this.currentList == 'replies' ) ? date = '' : date = ' - ' + Tweetbar.relative_time_string(tweet.created_at);
				
				/*
				 * Hashtags implementation - by Joschi
				 */
				tweet.text = tweet.text.replace(/(\s|^|)(#(\w*))([\s.!()/]|$)/g,'$1<a target="_blank" href="http://hashtags.org/tag/$3">$2</a>$4');

				// Markdown //
				tweet.text = Tweetbar.markDown.makeHtml(tweet.text);
				
				favorite = '';
				if ( tweet.favorited == true )
					favorite = '<a class="re" href="javascript: Tweetbar.unfav_tweet(\'' + tweet.id + '\'); void 0;"><img id="fav-' + tweet.id + '" class="re" src="chrome://twitkit/skin/images/fav_remove.png" alt="" /></a>';
				else
					favorite = '<a class="re" href="javascript: Tweetbar.fav_tweet(\'' + tweet.id + '\'); void 0;"><img id="fav-' + tweet.id + '" class="re" src="chrome://twitkit/skin/images/fav_add.png" alt="" /></a>';
				
				if ( tweet.truncated )
					tweet.text = tweet.text.replace(/\.\.\.$/, Tweetbar.anchor_tag(Tweetbar.protocol + '://twitter.com/' + tweet.user.screen_name + '/statuses/' + tweet.id, '...'));
				
				if ( tweet.reply_id ) {
					user_regexp = /@([a-zA-Z0-9_]+)/;
					user = user_regexp.exec(tweet.text)[1];
					in_reply_to = '<br/>in reply to <a href="' + Tweetbar.protocol + '://twitter.com/' + user + '/statuses/' + tweet.reply_id + '/" target="_blank">' + user + '</a>';
				} else
					in_reply_to = '';

				return '<p class="pic"><a href="#" onclick="setReply(\'' + tweet.user.screen_name + '\');">'+ user_image + '</a>' +
					   '<span class="re"><a class="re" href="#" onclick="setReply(\''+ tweet.user.screen_name + '\'); return false;"><img class="re" src="chrome://twitkit/skin/images/reply.png" alt="" /></a>&nbsp;' +
					   favorite + '</span></p>' +
					   '<p class="what">' + tweet.text + '</p>' +
					   '<p class="who">' + this.user_anchor_tag(tweet.user) + date + in_reply_to + '</p>' +
					   source + dellink;
			}
		},
	/**
	 * Render a direct message (but don't print it).
	 * 
	 * @param {Object} tweet A tweet object returned by Tweetbar#create_status_object.
	 * @param {Object} li A MooTools Element object of a 'li' element.
	 * @returns {String} Fully-rendered tweet HTML.
	 * @see Tweetbar#create_status_object
	 * @methodOf Tweetbar
	 * @since 1.2
	 */
	render_direct_message:
		function (tweet, li) {
			var display_date = '';
			if ( tweet ) {
				if ( !tweet._a )
					tweet._a = true;
				else if ( !tweet._b )
					tweet._b = true;
				if ( this.currentList != 'direct_messages' )
					li.setProperty('id', tweet.id);
				
				var sender_image = '';
				if ( tweet.sender && tweet.sender.profile_image_url )
					sender_image = '<img src="' + tweet.sender.profile_image_url + '" width="24" height="24" alt="' + tweet.sender.name + '" />';
				
				( this.currentList == 'direct_messages' ) ? date = '' : date = ' - ' + Tweetbar.relative_time_string(tweet.created_at);
				
				/*
				 * Hashtags implementation - by Joschi
				 */
				tweet.text = tweet.text.replace(/(\s|^|)(#(\w*))([\s.!()/]|$)/g,'$1<a target="_blank" href="http://hashtags.org/tag/$3">$2</a>$4');

				// Markdown //
				tweet.text = Tweetbar.markDown.makeHtml(tweet.text);
				
				return '<p class="pic"><a href="#" onclick="setReplyDM(\'' + tweet.sender.screen_name + '\');">'+ sender_image + '</a>' +
					   '<span class="re"><a class="re" href="#" onclick="setReplyDM(\''+ tweet.sender.screen_name + '\'); return false;"><img class="re" src="chrome://twitkit/skin/images/reply.png" alt="" /></a>&nbsp;' + '</span></p>' +
					   '<p class="what">' + tweet.text + '</p>' +
					   '<p class="who">' + this.user_anchor_tag(tweet.sender) + date + '</p>';
			}
		},
	/**
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
    
			return '<p class="pic"><a href="#" onclick="setReply(\'' + user.screen_name + '\');"><img src="' + user.profile_image_url + '" width="24" height="24" alt="' + user.name + '" /></a>' +
				   '<p class="what" style="font-size: 120%;">' + user.name + '</p>' +
				   '<p class="who">' + status + '<br/>' +
				   '<a target="_blank" href="' + Tweetbar.protocol + '://twitter.com/' + user.screen_name + '">' + user.screen_name + '</a></p>';
		},
	
	// List Updating //
	/**
	 * Update the current list of tweets (print it).
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	update_current_list:
		function () {
			$('tweets').setHTML('');
			if ( ( this.currentList == 'public_timeline' ) || ( this.currentList == 'friends_timeline' ) ) {
				var current_tweets = this.current_tweets();
				var tweet_ids = [];
				for ( var tid in current_tweets )
					tweet_ids.push(tid);
				tweet_ids = tweet_ids.sort().reverse();
				for ( var i=0; i < tweet_ids.length; i++ ) {
					var li = new Element('li');
					li.setHTML(this.render_tweet(current_tweets[tweet_ids[i]], li));
					if ( ( i % 2 ) == 0 )
						li.addClass('even');
					if ( Tweetbar.username && current_tweets[tweet_ids[i]].text.search('@' + Tweetbar.username) !== -1 )
						li.addClass('reply');
					li.injectInside($('tweets'));
				}
			} else if ( this.currentList == 'friends' || this.currentList == 'followers' ) {
				( this.currentList == 'friends' ) ? theurl = Tweetbar.protocol + '://twitter.com/statuses/friends/' + this.username + '.json?lite=true' : theurl = Tweetbar.protocol + '://twitter.com/statuses/followers.json?lite=true';
				var aj = new Ajax( theurl, {
					headers: Tweetbar.http_headers(),
					method: 'get',
					postBody: {},
					onSuccess:
						function (raw_data) {
							var rsp = Json.evaluate(raw_data);
							var i = 0;
							for ( var user in rsp ) {
								if ( (rsp[user]['screen_name'] != undefined) && (rsp[user]['screen_name'] != 'forEach') ) {
									var li = new Element('li');
									li.setHTML(Tweetbar.render_user(rsp[user]));
									if ( ( i % 2 ) == 0 )
										li.addClass('even');
									li.injectInside('tweets');
									i++;
								}
							}
						}
				}).request();
			} else if ( this.currentList == 'replies' ) {
				var aj = new Ajax( Tweetbar.protocol + '://twitter.com/statuses/mentions.json', {
					headers: Tweetbar.http_headers(),
					method: 'get',
					postBody: {},
					onSuccess:
						function (raw_data) {
							var rsp = Json.evaluate(raw_data);
							var i = 0;
							for ( var reply in rsp ) {
								var li = new Element('li');
								rsp[reply].text = Tweetbar.expand_status(rsp[reply].text);
								li.setHTML(Tweetbar.render_tweet(rsp[reply]));
								if ( ( i % 2 ) == 0 )
									li.addClass('even');
								li.injectInside('tweets');
								i++;
							}
						}
				}).request();
			} else if ( this.currentList == 'direct_messages' ) {
				var aj = new Ajax( Tweetbar.protocol + '://twitter.com/direct_messages.json', {
					headers: Tweetbar.http_headers(),
					method: 'get',
					postBody: {},
					onSuccess:
						function (raw_data) {
							var rsp = Json.evaluate(raw_data);
							var i = 0;
							for ( var direct_message in rsp ) {
								var li = new Element('li');
								rsp[direct_message].text = Tweetbar.expand_status(rsp[direct_message].text);
								li.setHTML(Tweetbar.render_direct_message(rsp[direct_message]));
								if ( ( i % 2 ) == 0 )
									li.addClass('even');
								li.injectInside('tweets');
								i++;
							}
						}
				}).request();
			} else if ( this.currentList == 'me' ) {
				var aj = new Ajax( Tweetbar.protocol + '://twitter.com/users/show/' + this.username + '.json', {
					headers: Tweetbar.http_headers(),
					method: 'get',
					postBody: {},
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
						}
				}).request();
			}
		},
	/**
	 * Retrieve tweets from Twitter.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	get_tweets:
		function () {
			var panel = Tweetbar.currentList;
			var url = Tweetbar.api_url_for_statuses(panel);
			if ( panel == 'direct_messages' )
				url = Tweetbar.api_url_for_nonstatuses(panel);
			var aj = new Ajax( url, {
				headers: Tweetbar.http_headers(),
				method: 'get',
				postBody: {},
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
					}
			}).request();
		},
	/**
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
			this.tweets[panel] = {};
			for ( var i = 0; i < new_tweets.length; i++ ) {
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
	
	// Refresh //
	/**
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
	/**
	 * Stop periodical updates.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	clear_updater:
		function () {
			if ( this.updater )
				$clear(this.updater);
		},
	/**
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
	
	// Tweet Actions //	
	/**
	 * Add a tweet to the user's favorites.
	 * 
	 * @param {String} tweetid The ID of the tweet to add to favorites.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	fav_tweet:
		function (tweetid) {
			var aj = new Ajax( Tweetbar.protocol + '://twitter.com/favorites/create/' + tweetid + '.json', {
				headers: Tweetbar.http_headers(),
				postBody: {},
				onSuccess:
					function () {
						var x = document.getElementById('fav-' + tweetid);
						x.src = 'chrome://twitkit/skin/images/fav_remove.png';
					},
				onFailure:
					function (e) {
						alert(this._('errors.ajax') + e);
					}
			}).request();
		},
	/**
	 * Remove a tweet from the user's favorites.
	 * 
	 * @param {String} tweetid The ID of the tweet to remove from favorites.
	 * @methodOf Tweetbar
	 * @since 1.1
	 */
	unfav_tweet:
		function (tweetid) {
			var aj = new Ajax( Tweetbar.protocol + '://twitter.com/favorites/destroy/' + tweetid + '.json', {
				headers: Tweetbar.http_headers(),
				postBody: {},
				onSuccess:
					function () {
						var x = document.getElementById('fav-' + tweetid);
						x.src = 'chrome://twitkit/skin/images/fav_add.png';
					},
				onFailure:
					function (e) {
						alert(this._('errors.ajax') + e);
					}
			}).request();
		},
	/**
	 * Delete one of the user's tweets.
	 * 
	 * @param {String} tweetid The ID of the tweet to delete. The user MUST own this tweet.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	delete_tweet:
		function (tweetid) {
			var aj = new Ajax( Tweetbar.protocol + '://twitter.com/statuses/destroy/' + tweetid + '.json', {
				headers: Tweetbar.http_headers(),
				postBody: {},
				onSuccess:
					function () {
						delete Tweetbar.tweets[Tweetbar.currentList][tweetid];
						var slider = new Fx.Slide(tweetid);
						slider.toggle();
					},
				onFailure:
					function (e) {
						alert(this._('errors.ajax') + e);
				}
			}).request();
		},
	/**
	 * Umbrella function for updating the user's status -
	 * does some authentication checking and then runs the
	 * actual update function, Tweetbar#send_tweet.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	update_status:
		function (status, callback) {
			if ( this.isAuthenticated )
				this.send_tweet(status, callback);
			else {
				this.authenticate('update');
				this.pendingUpdate = {callback: callback, status: status};
			}
		},
	/**
	 * Send a status update to Twitter.
	 * 
	 * @param {String} status Status to send to Twitter
	 * @param {Function} [callback=""] Function to run after the tweet is successfully sent
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	send_tweet:
		function (status, callback) {
			var aj = new Ajax( Tweetbar.api_url_for_statuses('update'), {
				headers: Tweetbar.http_headers(),
				postBody: Object.toQueryString({status: status, source: 'twitkit'}),
				onComplete:
					function () {
						callback();
					},
				onSuccess:
					function (raw_data) {
						Tweetbar.save_tweets(this.currentList, raw_data);
						if ( Tweetbar.currentList == 'friends_timeline' )
							setTimeout('Tweetbar.manual_refresh();', 1000);
					},
				onFailure:
					function (e) {
						alert(this._('errors.ajax') + e);
					}
			}).request();
		},
	
	// Panel Functions //
	/**
	 * Switch to a new panel.
	 * 
	 * @param {String} name The name of the panel to switch to.
	 * @param {Object} [caller=""] A DOM object from where the function was called.
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	activate_panel:
		function (name, caller) {
			if ( name == '' )
				name = 'public_timeline';
			if ( !this.authorization_required_for(name) || this.isAuthenticated ) {
				this.currentList = name;
				this.update_current_list();
				this.clear_current_tweets();
				
				$('tab_for_public_timeline').removeClass('active');
				$('tab_for_friends_timeline').removeClass('active');
				$('tab_for_friends').removeClass('active');
				$('tab_for_followers').removeClass('active');
				$('tab_for_replies').removeClass('active');
				$('tab_for_direct_messages').removeClass('active');
				$('tab_for_me').removeClass('active');
				
				$('tab_for_'+name).addClass('active');
				
				if ( caller )
					caller.blur();
				
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
			h -= 20;
			$('lists').setStyle('overflow', 'auto');
			$('lists').setStyle('height', h+'px');
			var w = Window.getWidth() + 15;
			$('tweets').setStyle('max-width', w+'px');
		},
	
	// Docking //
	/**
	 * Undock TwitKit.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.1
	 */
	undock:
		function () {
			window.open('chrome://twitkit/content/twitkit.html?undocked', 'TwitKit', 'width=300,resizable=yes,scrollbars=no,toolbar=no,location=no,directories=no,status=no,menubar=no,copyhistory=no');
			Tweetbar.DOMWindow.toggleSidebar('viewTweetbar');
		},
	
	// Authorization //
	/**
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
			if ( obj )
				obj.blur();
			
			var x = document.getElementById('username');
			x.value = '';
			
			x = document.getElementById('password');
			x.value = '';
		},
	/**
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
			if ( obj )
				obj.blur();

			$('username').focus();
		},
	/**
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
			if ( resource == 'public_timeline' )
				return false;
			return true;
		},
	/**
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
	 * Sign out of the current Twitter account.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	sign_out:
		function () {
			var aj = new Ajax( Tweetbar.protocol + '://twitter.com/account/end_session.json', {
				headers: Tweetbar.http_headers(),
				postBody: {},
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
						if ( Tweetbar.authorization_required_for(this.currentList) )
							Tweetbar.activate_panel('public_timeline');
					},
				onFailure:
					function () {
						alert(Tweetbar._('errors.signOut'));
					},
			}).request();
		},
	/**
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
			
			var aj = new Ajax( Tweetbar.protocol + '://twitter.com/account/verify_credentials', {
				headers: this.http_headers(),
				method: 'get',
				postBody: {},
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
							} else
								alert(this._('errors.signOut'));
							if ( callback ) {
								try { callback(); } catch(e) { };
						}
					},
			}).request();
		},
	/**
	 * Show the current user's name and a sign-out button
	 * after signing in.
	 * 
	 * @methodOf Tweetbar
	 * @since 1.0
	 */
	set_username_on_page:
		function () {
			$('whoami').setStyle('backgroundColor', 'transparent');
			$('whoami').setHTML('<p><a href="' + Tweetbar.protocol + '://twitter.com/' + Tweetbar.username + '" target="_blank">'+Tweetbar.username+'</a> [<a href="#" onclick="Tweetbar.sign_out(); return false;" alt="sign out" title="sign out">' + this._('login.signOut') + '</a>]</p>');
			$('loginwrap').setStyle('display', 'none');
		},
	
};

window.onload = function () {
	Tweetbar.run();
};

window.onresize = function () {
	Tweetbar.setListSize();
};
