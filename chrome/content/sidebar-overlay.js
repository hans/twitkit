/**
 * A class to assist the browser overlay dialog
 * 
 * @class
 */
var TwitOverlay = {
	/**
	 * The service responsible for retrieving and setting preferences
	 */
	mPrefRoot: Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch2),
	/**
	 * Service used to manipulate XUL dialogs
	 */
	mWindowMediator: Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator),
	
	/**
	 * Retrieve a preference
	 * 
	 * @param {String} aName The name of the preference.
	 * @param {String} aDefault A default value to return if something goes wrong.
	 * @returns {Mixed} The preference's value or aDefault on error.
	 * @methodOf TwitOverlay
	 * @since 1.0
	 */
	getPref: function(aName, aDefault)
	{
		try
		{
			var pb = this.mPrefRoot;
			switch (pb.getPrefType(aName))
			{
				case pb.PREF_STRING:
					return pb.getComplexValue(aName,this.mComponents.interfaces.nsISupportsString).data
				case pb.PREF_BOOL:
					return pb.getBoolPref(aName);
				case pb.PREF_INT:
					return pb.getIntPref(aName);
			}
		}
		catch (ex) { }
		
		return aDefault;
	},
	/**
	 * Open TwitKit's Preferences window
	 * 
	 * @methodOf TwitOverlay
	 * @since 1.0
	 */
	openPrefs: function()
	{
		var dialog = this.mWindowMediator.getMostRecentWindow("TwitKit:Preferences");
		if (dialog)
		{
			dialog.focus();
			return;
		}
		
		openDialog("chrome://twitkit/content/preferences.xul", "_blank", "chrome,titlebar,centerscreen," + ((this.getPref("browser.preferences.instantApply", false))?"dialog=no":"modal"));
	},
	/**
	 * Open TwitKit's About window
	 * 
	 * @methodOf TwitOverlay
	 * @since 1.0
	 */
	openAbout: function()
	{
		var dialog = this.mWindowMediator.getMostRecentWindow("TwitKit:About");
		if ( dialog )
		{
			dialog.focus();
			return;
		}
		
		openDialog("chrome://twitkit/content/about.xul", "_blank", "chrome,titlebar,centerscreen," + ((this.getPref("browser.preferences.instantApply", false)) ? "dialog=no" : "modal" ));
	}
};