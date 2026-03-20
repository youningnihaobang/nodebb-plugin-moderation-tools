<div class="moderation-tools" id="moderation-tools">
	<!-- Sticky Header -->
	<div class="moderation-tools-header sticky-top bg-body border-bottom py-2 px-3 mb-3">
		<div class="row align-items-center">
			<div class="col-12 col-md-8">
				<div class="d-flex align-items-center gap-2">
					<h4 class="fw-bold mb-0">
						<i class="fa fa-wrench text-muted me-1"></i>
						[[moderation-tools:page-title]]
					</h4>
				</div>
			</div>
			<div class="col-12 col-md-4 mt-2 mt-md-0">
				<button id="moderation-tools-save" class="btn btn-primary btn-sm w-100 fw-semibold">
					<i class="fa fa-save me-1"></i> [[moderation-tools:save]]
				</button>
			</div>
		</div>
	</div>

	<!-- Category Selector -->
	<div class="moderation-tools-category-selector mb-3">
		<label class="form-label fw-semibold" for="moderation-tools-cid-select">
			[[moderation-tools:select-category]]
		</label>
		<select id="moderation-tools-cid-select" class="form-select">
			{{{ each categories }}}
			<option value="{categories.cid}" {{{ if categories.cid === initialCid }}}selected{{{ end }}}>
				{categories.name} (CID: {categories.cid})
			</option>
			{{{ end }}}
		</select>
	</div>

	<!-- Empty State -->
	<div id="moderation-tools-empty" class="moderation-tools-empty text-center py-5 {{{ if categories.length }}}hidden{{{ end }}}">
		<i class="fa fa-folder-open fa-3x text-muted mb-3"></i>
		<h5>[[moderation-tools:no-categories]]</h5>
		<p class="text-muted">[[moderation-tools:no-categories-help]]</p>
	</div>

	<!-- Main Content -->
	<div class="row" id="moderation-tools-content" {{{ if !categories.length }}}hidden{{{ end }}}>
		<!-- Left: Form -->
		<div class="col-12 col-md-8">
			<div id="moderation-tools-loading" class="text-center py-5">
				<i class="fa fa-spinner fa-spin fa-2x text-muted"></i>
				<p class="text-muted mt-2">[[moderation-tools:loading]]</p>
			</div>

			<div id="moderation-tools-form-container" class="hidden">
				<form id="moderation-tools-form" class="moderation-tools-form">

					<!-- Name -->
					<div class="mb-3 moderation-tools-field" data-field="name">
						<label class="form-label" for="mt-name">[[moderation-tools:fields:name]]</label>
						<input id="mt-name" type="text" class="form-control" data-name="name" />
					</div>

					<!-- Handle -->
					<div class="mb-3 moderation-tools-field" data-field="handle">
						<label class="form-label" for="mt-handle">[[moderation-tools:fields:handle]]</label>
						<input id="mt-handle" type="text" class="form-control" data-name="handle" />
						<p class="form-text">[[moderation-tools:fields:handle-help]]</p>
					</div>

					<!-- Description -->
					<div class="mb-3 moderation-tools-field" data-field="description">
						<label class="form-label" for="mt-description">[[moderation-tools:fields:description]]</label>
						<textarea id="mt-description" data-name="description" class="form-control" rows="4"></textarea>
					</div>

					<!-- Topic Template -->
					<div class="mb-3 moderation-tools-field" data-field="topicTemplate">
						<label class="form-label" for="mt-topicTemplate">[[moderation-tools:fields:topicTemplate]]</label>
						<textarea id="mt-topicTemplate" data-name="topicTemplate" class="form-control" rows="4"></textarea>
						<p class="form-text">[[moderation-tools:fields:topicTemplate-help]]</p>
					</div>

					<!-- Parent Category -->
					<div class="mb-3 moderation-tools-field" data-field="parentCid">
						<label class="form-label" for="mt-parentCid">[[moderation-tools:fields:parentCid]]</label>
						<select id="mt-parentCid" data-name="parentCid" class="form-select">
							<option value="0">[[moderation-tools:no-parent]]</option>
							{{{ each categories }}}
							<option value="{categories.cid}">{categories.name}</option>
							{{{ end }}}
						</select>
					</div>

					<!-- Num Recent Replies -->
					<div class="mb-3 moderation-tools-field" data-field="numRecentReplies">
						<label class="form-label" for="mt-numRecentReplies">[[moderation-tools:fields:numRecentReplies]]</label>
						<input id="mt-numRecentReplies" type="number" class="form-control" data-name="numRecentReplies" min="0" style="max-width: 120px;" />
					</div>

					<!-- Sub Categories Per Page -->
					<div class="mb-3 moderation-tools-field" data-field="subCategoriesPerPage">
						<label class="form-label" for="mt-subCategoriesPerPage">[[moderation-tools:fields:subCategoriesPerPage]]</label>
						<input id="mt-subCategoriesPerPage" type="number" class="form-control" data-name="subCategoriesPerPage" min="0" style="max-width: 120px;" />
					</div>

				<!-- Min/Max Tags (shown when either is enabled) -->
				<div class="mb-3 moderation-tools-field-group" data-field-group="tags">
					<label class="form-label">[[moderation-tools:fields:minTags]] / [[moderation-tools:fields:maxTags]]</label>
					<div class="d-flex gap-3 align-items-center">
						<div class="d-flex gap-1 align-items-center">
							<label for="mt-minTags" class="form-label mb-0">[[admin/admin:min]]</label>
							<input id="mt-minTags" type="number" class="form-control mt-min-tags-field" data-name="minTags" min="0" style="max-width: 80px;" />
						</div>
						<div class="d-flex gap-1 align-items-center">
							<label for="mt-maxTags" class="form-label mb-0">[[admin/admin:max]]</label>
							<input id="mt-maxTags" type="number" class="form-control mt-max-tags-field" data-name="maxTags" min="0" style="max-width: 80px;" />
						</div>
					</div>
				</div>

					<!-- Tag Whitelist -->
					<div class="mb-3 moderation-tools-field" data-field="tagWhitelist">
						<label class="form-label" for="mt-tagWhitelist">[[moderation-tools:fields:tagWhitelist]]</label>
						<input id="mt-tagWhitelist" type="text" class="form-control" data-name="tagWhitelist" />
					</div>

					<!-- External Link -->
					<div class="mb-3 moderation-tools-field" data-field="link">
						<label class="form-label" for="mt-link">[[moderation-tools:fields:link]]</label>
						<input id="mt-link" type="text" class="form-control" data-name="link" placeholder="http://example.com" />
					</div>

					<!-- Is Section -->
					<div class="mb-3 moderation-tools-field" data-field="isSection">
						<div class="form-check form-switch">
							<input type="checkbox" class="form-check-input" id="mt-isSection" data-name="isSection" />
							<label for="mt-isSection" class="form-check-label">[[moderation-tools:fields:isSection]]</label>
						</div>
					</div>

					<!-- Post Queue -->
					<div class="mb-3 moderation-tools-field" data-field="postQueue">
						<div class="form-check form-switch">
							<input type="checkbox" class="form-check-input" id="mt-postQueue" data-name="postQueue" />
							<label for="mt-postQueue" class="form-check-label">[[moderation-tools:fields:postQueue]]</label>
						</div>
					</div>

					<hr/>

					<!-- Background Image -->
					<div class="mb-3 moderation-tools-field" data-field="backgroundImage">
						<label class="form-label" for="mt-backgroundImage">[[moderation-tools:fields:backgroundImage]]</label>
						<input id="mt-backgroundImage" type="text" class="form-control" data-name="backgroundImage" placeholder="https://example.com/image.jpg" />
					</div>

					<!-- Background Color -->
					<div class="mb-3 moderation-tools-field" data-field="bgColor">
						<label class="form-label" for="mt-bgColor">[[moderation-tools:fields:bgColor]]</label>
						<input type="color" id="mt-bgColor" data-name="bgColor" class="form-control p-1" style="max-width: 80px; height: 40px;" />
					</div>

					<!-- Text Color -->
					<div class="mb-3 moderation-tools-field" data-field="color">
						<label class="form-label" for="mt-color">[[moderation-tools:fields:color]]</label>
						<input type="color" id="mt-color" data-name="color" class="form-control p-1" style="max-width: 80px; height: 40px;" />
					</div>

					<!-- Image Class -->
					<div class="mb-3 moderation-tools-field" data-field="imageClass">
						<label class="form-label" for="mt-imageClass">[[moderation-tools:fields:imageClass]]</label>
						<select id="mt-imageClass" data-name="imageClass" class="form-select w-auto">
							<option value="auto">auto</option>
							<option value="cover">cover</option>
							<option value="contain">contain</option>
						</select>
					</div>

					<!-- Custom Class -->
					<div class="mb-3 moderation-tools-field" data-field="class">
						<label class="form-label" for="mt-class">[[moderation-tools:fields:class]]</label>
						<input id="mt-class" type="text" class="form-control" data-name="class" />
					</div>
				</form>
			</div>
		</div>

		<!-- Right: Sidebar -->
		<div class="col-12 col-md-4">
			<div class="moderation-tools-sidebar">
				<div class="card">
					<div class="card-body p-0">
						<div class="list-group list-group-flush">
							{{{ if config.enabledSidebarActions.viewCategory }}}
							<a id="mt-sidebar-view" href="#" class="list-group-item list-group-item-action d-flex gap-2 align-items-center">
								<i class="fa fa-eye text-primary"></i>
								[[moderation-tools:sidebar-actions:viewCategory]]
							</a>
							{{{ end }}}

							{{{ if config.enabledSidebarActions.analytics }}}
							<a id="mt-sidebar-analytics" href="#" class="list-group-item list-group-item-action d-flex gap-2 align-items-center">
								<i class="fa fa-chart-simple text-primary"></i>
								[[moderation-tools:sidebar-actions:analytics]]
							</a>
							{{{ end }}}
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
