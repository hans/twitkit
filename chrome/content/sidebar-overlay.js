var TwitOverlay = {
	mPrefRoot: Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch2),
	mWindowMediator: Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator),
	
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