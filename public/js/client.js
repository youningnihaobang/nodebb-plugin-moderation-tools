'use strict';

/* global ajaxify, config */

$(document).ready(function () {
	$(window).on('action:ajaxify.end', function () {
		if (ajaxify.currentPage === 'extra-tools/moderation-tools') {
			require(['moderation-tools'], function (ModerationTools) {
				ModerationTools.init();
			});
		} else {
			$(window).off('beforeunload.moderationTools');
		}
	});

	// Handle initial page load (script loaded after DOM ready)
	if (typeof ajaxify !== 'undefined' && ajaxify.currentPage === 'extra-tools/moderation-tools') {
		require(['moderation-tools'], function (ModerationTools) {
			ModerationTools.init();
		});
	}
});
