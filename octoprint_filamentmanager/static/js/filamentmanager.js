/*
 * View model for OctoPrint-FilamentManager
 *
 * Author: Sven Lohrmann <malnvenshorn@gmail.com>
 * License: AGPLv3
 */
$(function() {

    var cleanProfile = function() {
        return {
            id: 0,
            name: "",
            cost: 20,
            weight: 1000,
            density: 1.25,
            diameter: 1.75
        };
    };

    var cleanSpool = function() {
        return {
            id: 0,
            name: "",
            profile_id: 0,
            used: 0
        };
    };

    function ProfileEditorViewModel(profiles) {
        var self = this;

        self.profiles = profiles;
        self.isNew = ko.observable(true);
        self.selectedProfile = ko.observable();

        self.id = ko.observable();
        self.name = ko.observable();
        self.cost = ko.observable();
        self.weight = ko.observable();
        self.density = ko.observable();
        self.diameter = ko.observable();

        self.nameInvalid = ko.pureComputed(function() {
            return !self.name();
        });

        self.selectedProfile.subscribe(function() {
            if (self.selectedProfile() === undefined) {
                if (!self.isNew()) {
                    // selected 'new profile' in options menu, but no profile created yet
                    self.fromProfileData();
                }
                return;
            }

            // find profile data
            var data = ko.utils.arrayFirst(self.profiles(), function(item) {
                return item.id == self.selectedProfile();
            });

            if (data !== null) {
                // populate data
                self.fromProfileData(data);
            }
        });

        self.fromProfileData = function(data) {
            self.isNew(data === undefined);

            if (data === undefined) {
                data = cleanProfile();
                self.selectedProfile(undefined);
            }

            self.id(data.id);
            self.name(data.name);
            self.cost(data.cost);
            self.weight(data.weight);
            self.density(data.density);
            self.diameter(data.diameter);
        };

        self.toProfileData = function() {
            var defaultProfile = cleanProfile();

            var validFloat = function(value, def) {
                var f = parseFloat(value);
                return isNaN(f) ? def : f;
            };

            return {
                id: self.id(),
                name: self.name(),
                cost: validFloat(self.cost(), defaultProfile.cost),
                weight: validFloat(self.weight(), defaultProfile.weight),
                density: validFloat(self.density(), defaultProfile.density),
                diameter: validFloat(self.diameter(), defaultProfile.diameter)
            };
        };

        self.fromProfileData();
    }

    function SpoolEditorViewModel(profiles) {
        var self = this;

        self.profiles = profiles;
        self.isNew = ko.observable(false);

        self.id = ko.observable();
        self.name = ko.observable();
        self.selectedProfile = ko.observable();
        self.used = ko.observable();

        self.totalWeight = ko.observable();
        self.remaining = ko.observable();

        self.nameInvalid = ko.pureComputed(function() {
            return !self.name();
        });

        self.selectedProfile.subscribe(function() {
                var data = ko.utils.arrayFirst(self.profiles(), function(item) {
                    return item.id == self.selectedProfile();
                });
                if (data !== null) {
                    self.totalWeight(data.weight);
                    if (self.isNew()) {
                        // automatically set remaining weight = total weight if spool is new
                        // otherwise we keep the entered value
                        self.remaining(data.weight);
                    }
                }
        });

        self.fromSpoolData = function(data) {
            self.isNew(data === undefined);

            if (data === undefined) {
                data = cleanSpool();
                if (self.profiles().length > 0) {
                    // automatically select first profile in list
                    data.profile_id = self.profiles()[0].id;
                }
            }

            // populate data
            self.id(data.id);
            self.name(data.name);
            self.selectedProfile(data.profile_id);
            self.selectedProfile.valueHasMutated(); // if the selected profile gets modified we have to ensure
                                                    // that the values get updated here as well
            self.remaining(self.totalWeight() - data.used);
        };

        self.toSpoolData = function() {
            return {
                id: self.id(),
                name: self.name(),
                profile_id: self.selectedProfile(),
                used: self.used()
            };
        };

        self.remaining.subscribe(function() {
            self.used(self.totalWeight() - self.remaining());
        });

        self.totalWeight.subscribe(function() {
            self.used(self.totalWeight() - self.remaining());
        });
    }

    function FilamentManagerViewModel(parameters) {
        var self = this;

        self.settings = parameters[0];

        self.requestInProgress = ko.observable(false);

        self.profiles = ko.observableArray([]);
        self.spoolsRaw = ko.observableArray([]);

        self.spools = new ItemListHelper(
            "filamentSpools",
            {
                "name": function(a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "profile": function(a, b) {
                    // sorts ascending
                    if (a["profileName"].toLocaleLowerCase() < b["profileName"].toLocaleLowerCase()) return -1;
                    if (a["profileName"].toLocaleLowerCase() > b["profileName"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "remaining": function(a, b) {
                    // sorts descending
                    va = parseFloat(a.profile.weight) - parseFloat(a.used);
                    vb = parseFloat(b.profile.weight) - parseFloat(b.used);
                    if (va > vb) return -1;
                    if (va < vb) return 1;
                    return 0;
                }
            },
            {}, "name", [], [], 5
        );

        self.selectedSpools = ko.observableArray([]);

        self.tools = ko.observableArray([]);

        self.profileEditor = new ProfileEditorViewModel(self.profiles);
        self.spoolEditor = new SpoolEditorViewModel(self.profiles);

        self.onStartup = function() {
            self.profileDialog = $("#settings_plugin_filamentmanager_profiledialog");
            self.spoolDialog = $("#settings_plugin_filamentmanager_spooldialog");
        };

        self.onBeforeBinding = function() {
            var selectedSpools = self.settings.settings.plugins.filamentmanager.selectedSpools;
            var selectedSpoolsCount = Object.keys(selectedSpools).length;
            for (var i = 0; i < selectedSpoolsCount; ++i) {
                var id = "tool" + i;
                selectedSpools[id].subscribe(self._updateSelectedSpoolData);
            }


            self._syncWithExtruderCount();
            self.settings.printerProfiles.currentProfileData.subscribe(function() {
                self._syncWithExtruderCount();
            });
        };

        self.onStartupComplete = function() {
            self.requestData("profiles");
            self.requestData("spools");
        };

        self.onEventPrinterStateChanged = function() {
            self.requestData("spools");
        };

        /*
         * Sets number of tools for template generation and if neccessary adds
         * dictionary entries in the settings to save the selected spools.
         */
        self._syncWithExtruderCount = function() {
            var currentProfileData = self.settings.printerProfiles.currentProfileData();
            var numExtruders = (currentProfileData ? currentProfileData.extruder.count() : 0);
            self.tools(new Array(numExtruders));

            var selectedSpools = self.settings.settings.plugins.filamentmanager.selectedSpools;
            var selectedSpoolsCount = Object.keys(selectedSpools).length;

            if (selectedSpoolsCount < numExtruders) {
                // add observables for new tools in the settings
                for (var i = selectedSpoolsCount; i < numExtruders; ++i) {
                    var id = "tool" + i;
                    selectedSpools[id] = ko.observable(0);
                    selectedSpools[id].subscribe(self._updateSelectedSpoolData);
                }
            }
        };

        self._updateSelectedSpoolData = function() {
            var list = []
            if (self.spools.items().length > 0) {
                for (var i = 0; i < self.tools().length; ++i) {
                    var id = self.settings.settings.plugins.filamentmanager.selectedSpools["tool"+i]();
                    if (id === undefined) {
                        list.push(undefined);
                        continue;
                    };
                    var data = ko.utils.arrayFirst(self.spools.items(), function(item) {
                        return item.id == id;
                    });
                    list.push(data);
                }
            }
            self.selectedSpools(list);
        };

        self.showProfilesDialog = function() {
            self.profileDialog.modal("show");
        };

        self.showSpoolDialog = function(data) {
            self.spoolEditor.fromSpoolData(data);
            self.spoolDialog.modal("show");
        };

        self.hideSpoolDialog = function() {
            self.spoolDialog.modal("hide");
        };

        self.requestData = function(data) {
            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/" + data,
                type: "GET",
                dataType: "json",
            })
            .done(function(data) {
                self.fromResponse(data);
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.fromResponse = function(data) {
            if (data.hasOwnProperty("profiles")) self.profiles(data.profiles);
            else if (data.hasOwnProperty("spools")) self.spoolsRaw(data.spools);
            else return;

            // spool list has to be updated in either case
            if (self.profiles().length > 0) {
                var rows = ko.utils.arrayMap(self.spoolsRaw(), function (spool) {
                    var profile = ko.utils.arrayFirst(self.profiles(), function(item) {
                        return item.id == spool.profile_id;
                    });

                    // need to create a new dictionary, otherwise the ui doesn't get updated properly on changes,
                    // because knockout observable array doesn't observe properties of items
                    return { id: spool.id,
                             name: spool.name,
                             used: spool.used,
                             profile_id: spool.profile_id,
                             profile: profile };

                });
                self.spools.updateItems(rows);
                if (self.selectedSpools().length > 0) {  // on start the selected spools data gets updated by the
                    self._updateSelectedSpoolData();     // options field, so we update only on changes after that
                }
            } else {
                self.spools.updateItems([]);
            }
        };

        self.saveProfile = function(data) {
            if (data === undefined) {
                data = self.profileEditor.toProfileData();
            }

            self.profileEditor.isNew() ? self.addProfile(data) : self.updateProfile(data);
        };

        self.addProfile = function(data) {
            if (data === undefined) {
                data = self.profileEditor.toProfileData();
            }

            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/profiles",
                type: "POST",
                data: JSON.stringify({profile: data}),
                contentType: "application/json; charset=UTF-8"
            })
            .done(function() {
                self.requestData("profiles");
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.updateProfile = function(data) {
            if (data === undefined) {
                data = self.profileEditor.toProfileData();
            }

            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/profiles/" + data.id,
                type: "PATCH",
                data: JSON.stringify({profile: data}),
                contentType: "application/json; charset=UTF-8"
            })
            .done(function() {
                self.requestData("profiles")
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.removeProfile = function(data) {
            if (data === undefined) {
                data = self.profileEditor.toProfileData();
            }

            var perform = function() {
                self.requestInProgress(true);
                $.ajax({
                    url: "plugin/filamentmanager/profiles/" + data.id,
                    type: "DELETE"
                })
                .done(function() {
                    self.requestData("profiles");
                })
                .fail(function() {
                    var text = gettext("There was an unexpected database error, please consult the logs.");
                    new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
                })
                .always(function() {
                    self.requestInProgress(false);
                });
            };

            var text = gettext("You are about to delete the filament profile \"%(name)s\"." //\
                               + " Please notice that it is not possible to delete profiles with associated spools.");
            showConfirmationDialog(_.sprintf(text, {name: data.name}), perform);
        };

        self.saveSpool = function(data) {
            if (data === undefined) {
                data = self.spoolEditor.toSpoolData();
            }

            self.spoolEditor.isNew() ? self.addSpool(data) : self.updateSpool(data);
        };

        self.addSpool = function(data) {
            if (data === undefined) {
                data = self.spoolEditor.toSpoolData();
            }

            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/spools",
                type: "POST",
                data: JSON.stringify({spool: data}),
                contentType: "application/json; charset=UTF-8"
            })
            .done(function() {
                self.requestData("spools");
                self.hideSpoolDialog();
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.updateSpool = function(data) {
            if (data === undefined) {
                data = self.spoolEditor.toSpoolData();
            }

            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/spools/" + data.id,
                type: "PATCH",
                data: JSON.stringify({spool: data}),
                contentType: "application/json; charset=UTF-8"
            })
            .done(function() {
                self.requestData("spools");
                self.hideSpoolDialog();
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.removeSpool = function(data) {
            if (data === undefined) {
                data = self.spoolEditor.toSpoolData();
            }

            var perform = function() {
                self.requestInProgress(true);
                $.ajax({
                    url: "plugin/filamentmanager/spools/" + data.id,
                    type: "DELETE"
                })
                .done(function() {
                    self.requestData("spools")
                })
                .fail(function() {
                    var text = gettext("There was an unexpected database error, please consult the logs.");
                    new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
                })
                .always(function() {
                    self.requestInProgress(false);
                });
            };

            var text = gettext("You are about to delete the filament spool \"%(name)s\".");
            showConfirmationDialog(_.sprintf(text, {name: data.name}), perform);
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FilamentManagerViewModel,
        dependencies: ["settingsViewModel"],
        elements: ["#settings_plugin_filamentmanager",
                   "#settings_plugin_filamentmanager_profiledialog",
                   "#settings_plugin_filamentmanager_spooldialog"]
    });
});
