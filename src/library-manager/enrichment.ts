/** Version 1 of the optional Library Enrichment provider API. */
export interface ArchiveCapabilities {
  api_version: number;
  selected_capture: boolean;
  source_listing?: boolean;
  preview_preconditions?: boolean;
  version_listing?: boolean;
  max_items: number;
}

export interface ArchiveSelection {
  provider_instance_id: string;
  source_playlist_id: string;
  max_items: number;
}

export interface ArchivePreview {
  provider_instance_id: string;
  source_playlist_id: string;
  account_id: string;
  snapshot_id: string;
  name: string;
  total: number;
  eligibility_reasons?: string[];
}

export interface ArchiveSourcePage {
  items: {
    source_playlist_id: string;
    name: string;
    library_item_id: string;
  }[];
  limit: number;
  offset: number;
  has_more: boolean;
  excluded?: { name: string; library_item_id: string; reason: string }[];
}

export interface ArchiveSubscription {
  id: string;
  account_id: string;
  provider_instance_id: string;
  source_playlist_id: string;
  name: string;
  observed_snapshot: string | null;
  committed_snapshot: string | null;
  committed_at: string | null;
  committed_version_id: string | null;
}

export interface ArchiveJob {
  id: string;
  subscription_id: string;
  state: "pending" | "committed" | "failed";
  received: number;
  total: number | null;
  error: string | null;
  created_at: string;
}

export interface ArchiveStatus {
  subscriptions: ArchiveSubscription[];
  jobs: ArchiveJob[];
}

export interface ArchiveVersion {
  id: string;
  snapshot_id: string;
  total: number;
  created_at: string;
}
