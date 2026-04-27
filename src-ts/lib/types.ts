export interface LocationConfig {
  f_id_kommune?: string;
  f_id_strasse?: string;
  f_id_strasse_hnr?: string;
  street_name?: string;
  hnr_name?: string;
}

export interface MqttConfig {
  enabled?: boolean;
  use_loxberry_broker?: boolean;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  topic_prefix?: string;
  retain?: boolean;
}

export interface MqttPublishStatus {
  ok: boolean;
  last: string;
  message?: string;
  topics_published?: number;
  broker?: string;
}

export interface PluginConfig {
  service_key?: string;
  language?: string;
  location?: LocationConfig;
  fetch_interval_hours?: number;
  fetch_fuzz_minutes?: number;
  categories_filter?: string[];
  mqtt?: MqttConfig;
}

export interface WasteEntry {
  tage: number;
  datum: string;
  /** Localized weekday (UI / MQTT string). */
  wochentag: string;
  /**
   * ISO weekday number 1 = Monday … 7 = Sunday (Loxone-friendly; optional on old caches).
   */
  wochentag_num?: number;
}

export interface WasteData {
  timestamp: string;
  standort: string;
  location: string;
  termine: Record<string, WasteEntry>;
  next_fetch_due?: string;
  next_fetch_offset_minutes?: number;
  mqtt?: MqttPublishStatus;
}

export interface ApiStatus {
  cookie_status: string;
  cookie_created: string;
  cookie_expires: string;
  client_id: string;
  last_fetch: string;
  next_fetch_due: string;
  location: string;
  location_api: string;
  termine_count: number;
  cached_data: Partial<WasteData> | Record<string, never>;
  api_mode: string;
  mqtt: MqttPublishStatus;
  /**
   * LoxBerry merged cron at `system/cron/cron.d/<FOLDER>` (see plugin `FOLDER` in `plugin.cfg`).
   * Omitted in dev or when $LBHOMEDIR / plugin id cannot be inferred.
   */
  install_cron?: {
    merged_cron_path: string;
    file_exists: boolean;
    /** True = unexpanded `REPLACELB*` in file (node would log MODULE_NOT_FOUND). */
    replacelb_placeholder_found: boolean;
  } | null;
}

export interface SearchItem {
  id: string;
  name: string;
}
