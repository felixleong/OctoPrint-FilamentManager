/* global FilamentManager ko $ */

FilamentManager.prototype.viewModels.config = function configurationViewModel() {
    const self = this.viewModels.config;
    const { settingsViewModel } = this.core.bridge.allViewModels;

    const dialog = $('#settings_plugin_filamentmanager_configurationdialog');

    self.showDialog = function showConfigurationDialog() {
        self.loadData();
        dialog.modal('show');
    };

    self.hideDialog = function hideConfigurationDialog() {
        dialog.modal('hide');
    };

    self.config = ko.mapping.fromJS({});

    self.saveData = function savePluginConfiguration(viewModel, event) {
        const target = $(event.target);
        target.prepend('<i class="fa fa-spinner fa-spin"></i> ');

        const data = {
            plugins: {
                filamentmanager: ko.mapping.toJS(self.config),
            },
        };

        settingsViewModel.saveData(data, {
            success() {
                self.hideDialog();
            },
            complete() {
                $('i.fa-spinner', target).remove();
            },
            sending: true,
        });
    };

    self.loadData = function mapPluginConfigurationToObservables() {
        const pluginSettings = settingsViewModel.settings.plugins.filamentmanager;
        ko.mapping.fromJS(ko.toJS(pluginSettings), self.config);
    };
};
