<script lang="ts">
	import { browser } from "$app/environment";
	import { updated } from "$app/state";
	import {
		appUpdateAttachment,
		forceRefreshClient,
		STALE_BUILD_DESCRIPTION,
	} from "$lib/app-update";
	import { showAppUpdateToast } from "$lib/app-toast";
	import { untrack } from "svelte";

	let updateToastVisible = false;
	let refreshStarted = false;

	function refreshForUpdate() {
		if (refreshStarted) return;
		refreshStarted = true;
		void forceRefreshClient();
	}

	function notifyUpdate(description = STALE_BUILD_DESCRIPTION) {
		if (refreshStarted || updateToastVisible) return;
		updateToastVisible = true;
		untrack(() => showAppUpdateToast(description, refreshForUpdate));
	}

	$effect(() => {
		if (browser && updated.current) notifyUpdate("A new app build is ready. Reload to switch to it.");
	});

	const updateAttachment = appUpdateAttachment({
			checkForUpdate: () => updated.check(),
			notify: notifyUpdate,
		});
</script>

<span hidden {@attach updateAttachment}></span>
