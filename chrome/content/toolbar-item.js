var ToolbarItem = {
	addToolbarItem:
		function() {
			try{
			this.prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.twitkit.");
			var showbutton = this.prefService.getBoolPref('showToolbarButton');
			if ( showbutton == false ) {
				return;
			}
			var firefoxWindow = parent.document;
			this.gToolbox = firefoxWindow.getElementById("navigator-toolbox");
			var gToolboxDocument = this.gToolbox.ownerDocument;
			var templateNode = this.gToolbox.palette.firstChild;
			var currentItems = this.getCurrentItemIds();
			var toolbar = firefoxWindow.getElementById("nav-bar");
			while (templateNode) {
				if ( !(templateNode.id in currentItems) ) {
					if (templateNode.id == "tweetbar-button") {
						var wrapper = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
							"toolbarpaletteitem");
						var urlBar = firefoxWindow.getElementById("urlbar-container");
						var newItem = toolbar.insertBefore(templateNode, urlBar);
						break;
					}
				}
				templateNode = templateNode.nextSibling;
			}}catch(e){alert(e);}
		},
	getCurrentItemIds:
		function() {
			var currentItems = {};
			for (var i = 0; i < this.gToolbox.childNodes.length; ++i) {
				var toolbar = this.gToolbox.childNodes[i];
				if ( this.isCustomizableToolbar(toolbar) ) {
					var child = toolbar.firstChild;
					while (child) {
						if ( this.isToolbarItem(child) )
							currentItems[child.id] = 1;
						child = child.nextSibling;
					}
				}
			}
			return currentItems;
		},
	isCustomizableToolbar:
		function(aElt) {
		return aElt.localName == "toolbar" &&
			aElt.getAttribute("customizable") == "true";
		},
	isToolbarItem:
		function(aElt) {
		return aElt.localName == "toolbarbutton" ||
			aElt.localName == "toolbaritem" ||
			aElt.localName == "toolbarseparator" ||
			aElt.localName == "toolbarspring" ||
			aElt.localName == "toolbarspacer";
		},
};