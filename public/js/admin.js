'use strict';

define('admin/plugins/moderation-tools', ['settings', 'alerts'], function (Settings, alerts) {
	var ACP = {};

	ACP.init = function () {
		Settings.load('moderation-tools', $('.moderation-tools-settings'));

		$('#save').on('click', function () {
			Settings.save('moderation-tools', $('.moderation-tools-settings'), function (err) {
				if (err) {
					alerts.error(err);
				} else {
					alerts.success('[[admin/admin:changes-saved]]');
				}
			});
		});
	};

	return ACP;
});
