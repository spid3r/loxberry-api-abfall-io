<?php
/**
 * Waste Collection - LoxBerry Plugin Admin UI
 * Provides configuration, status monitoring, and manual controls.
 */

require_once __DIR__ . "/i18n.php";

$lbhomedir = getenv('LBHOMEDIR') ?: (is_dir('/opt/loxberry') ? '/opt/loxberry' : '');
$lbplugindir = getenv('LBPPLUGINDIR') ?: basename(__DIR__);

if ($lbhomedir && is_dir($lbhomedir . '/bin/plugins/' . $lbplugindir)) {
    $sdk_system = $lbhomedir . '/libs/phplib/loxberry_system.php';
    $sdk_web = $lbhomedir . '/libs/phplib/loxberry_web.php';
    if (file_exists($sdk_system)) {
        require_once $sdk_system;
        require_once $sdk_web;
    }
    $plugin_config_dir = $lbhomedir . '/config/plugins/' . $lbplugindir;
    $plugin_data_dir = $lbhomedir . '/data/plugins/' . $lbplugindir;
    $plugin_bin_dir = $lbhomedir . '/bin/plugins/' . $lbplugindir;
    $plugin_lang_dir = $lbhomedir . '/templates/plugins/' . $lbplugindir . '/lang';
    if (!is_dir($plugin_lang_dir)) {
        $plugin_lang_dir = dirname(dirname(__DIR__)) . '/templates/lang';
    }
} else {
    $plugin_config_dir = dirname(dirname(__DIR__)) . '/config';
    $plugin_data_dir = dirname(dirname(__DIR__)) . '/data';
    $plugin_bin_dir = dirname(dirname(__DIR__)) . '/bin';
    $plugin_lang_dir = dirname(dirname(__DIR__)) . '/templates/lang';
}

$config_file = $plugin_config_dir . '/abfall.json';
$config = file_exists($config_file) ? (json_decode(file_get_contents($config_file), true) ?: []) : [];
$location = $config['location'] ?? [];

AbfallioI18N::bootstrap($plugin_lang_dir, (string) ($config['language'] ?? ''));
$activeLang = AbfallioI18N::lang();
$availableLangs = AbfallioI18N::availableLanguages();

$tab = $_GET['tab'] ?? 'status';
$allowedTabs = ['status', 'location', 'settings', 'log'];
if (!in_array($tab, $allowedTabs, true)) {
    $tab = 'status';
}

/**
 * Build query string for in-plugin navigation (language + tab).
 * Full page load ensures the active tab matches ?tab= even inside LBWeb.
 */
function abfallio_tab_href(string $t, string $activeLang): string
{
    return 'index.php?' . http_build_query(['lang' => $activeLang, 'tab' => $t], '', '&', PHP_QUERY_RFC3986);
}

$mqtt = $config['mqtt'] ?? [];
$mqttEnabled = (bool) ($mqtt['enabled'] ?? false);
$mqttUseLb = (bool) ($mqtt['use_loxberry_broker'] ?? true);
$mqttHost = (string) ($mqtt['host'] ?? '');
$mqttPort = (int) ($mqtt['port'] ?? 1883);
$mqttUser = (string) ($mqtt['user'] ?? '');
$mqttPassword = (string) ($mqtt['password'] ?? '');
$mqttTopic = (string) ($mqtt['topic_prefix'] ?? 'loxberry/abfallio');
$mqttRetain = (bool) ($mqtt['retain'] ?? true);

$serviceKey = (string) ($config['service_key'] ?? '');
$abfallioMapBundled = dirname(dirname(__DIR__)) . '/data/abfallio-service-map.json';
$abfallioMapUser = $plugin_data_dir . '/abfallio-service-map.json';
$abfallioServiceMapPath = is_file($abfallioMapUser) ? $abfallioMapUser : $abfallioMapBundled;
$abfallioServiceMap = [];
$abfallioServiceMapListSource = 'none';
if (is_file($abfallioServiceMapPath)) {
    $abfallioServiceMap = json_decode((string) file_get_contents($abfallioServiceMapPath), true) ?: [];
    $abfallioServiceMapListSource = is_file($abfallioMapUser) ? 'user' : 'bundled';
}
$abfallioServiceMapDisplay = $abfallioServiceMap;
usort(
    $abfallioServiceMapDisplay,
    static function ($a, $b): int {
        return strcasecmp(
            (string) (($a && is_array($a)) ? ($a['title'] ?? '') : ''),
            (string) (($b && is_array($b)) ? ($b['title'] ?? '') : ''),
        );
    }
);
$abfallioServiceMapCount = is_array($abfallioServiceMap) ? count($abfallioServiceMap) : 0;
$serviceRegionDisplay = '';
if ($serviceKey !== '') {
    $lookup = strtolower($serviceKey);
    foreach ($abfallioServiceMap as $row) {
        if (strtolower((string) ($row['service_id'] ?? '')) === $lookup) {
            $serviceRegionDisplay = (string) ($row['title'] ?? '');
            break;
        }
    }
}
if ($serviceKey !== '' && $serviceRegionDisplay === '') {
    $serviceRegionDisplay = AbfallioI18N::t('SETTINGS', 'MSG_REGION_UNKNOWN');
}
$fetchInterval = max(6, min(168, (int) ($config['fetch_interval_hours'] ?? 6)));
$fetchFuzz = (int) ($config['fetch_fuzz_minutes'] ?? 30);
$categoriesFilter = implode(', ', $config['categories_filter'] ?? []);

$dictJson = json_encode(AbfallioI18N::all(), JSON_UNESCAPED_UNICODE);

// On a real LoxBerry, use the standard admin shell (main menu, panels) like other plugins.
$use_loxberry_frame = class_exists('LBWeb', false);

$waste_plugin_css = <<<'WASTE_CSS'
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.5; }
        .abfallio-lb-embed { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.5; }
        .plugin-container { max-width: 960px; margin: 0 auto; padding: 20px; }
WASTE_CSS;

// --- remainder of component styles (shared standalone + embedded) ---
$waste_plugin_css .= <<<'WASTE_CSS'
        .plugin-header { background: #2e7d32; color: white; padding: 20px; border-radius: 8px 8px 0 0; display: flex; align-items: center; gap: 15px; }
        .plugin-header img { width: 48px; height: 48px; border-radius: 8px; }
        .plugin-header h1 { font-size: 1.5em; font-weight: 600; }
        .plugin-header .subtitle { opacity: 0.85; font-size: 0.9em; }
        .plugin-header .lang-switch { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 0.85em; }
        .plugin-header .lang-switch select { background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.4); border-radius: 4px; padding: 4px 8px; }
        .plugin-header .lang-switch select option { color: #333; }

        /* Top sub-navigation: same pattern as other LoxBerry plugins (links + full page), not JS-only buttons */
        .abfallio-subnav { display: flex; flex-wrap: wrap; background: #fff; border-bottom: 2px solid #e0e0e0; }
        a.abfallio-tab { padding: 12px 24px; cursor: pointer; font-size: 0.95em; color: #666; transition: all 0.2s; position: relative; text-decoration: none; display: inline-block; }
        a.abfallio-tab:hover { color: #2e7d32; }
        a.abfallio-tab.active { color: #2e7d32; font-weight: 600; }
        a.abfallio-tab.active::after { content: ''; position: absolute; bottom: -2px; left: 0; right: 0; height: 3px; background: #2e7d32; border-radius: 2px 2px 0 0; }

        .tab-content { display: none; background: #fff; padding: 24px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .tab-content.active { display: block; }

        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; font-weight: 600; margin-bottom: 6px; color: #555; font-size: 0.9em; }
        .form-group input, .form-group select { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95em; transition: border-color 0.2s; }
        .form-group input[type="checkbox"] { width: auto; margin-right: 6px; }
        .form-group .checkbox-row { display: flex; align-items: center; }
        .form-group small { color: #666; display: block; margin-top: 4px; font-weight: normal; font-size: 0.8em; }
        .category-filter-checkboxes { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; margin-top: 8px; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; background: #fafafa; }
        .category-filter-checkboxes label { display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer; font-size: 0.9em; }
        .category-filter-checkboxes .cat-filter-cb { width: auto; margin: 0; }
        .form-group input:focus, .form-group select:focus { outline: none; border-color: #2e7d32; box-shadow: 0 0 0 3px rgba(46,125,50,0.1); }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 600px) { .form-row { grid-template-columns: 1fr; } }
        .section-title { font-size: 1.05em; font-weight: 600; color: #2e7d32; margin: 24px 0 12px 0; padding-top: 18px; border-top: 1px solid #eee; }

        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border: none; border-radius: 6px; font-size: 0.9em; cursor: pointer; transition: all 0.2s; font-weight: 500; }
        .btn-primary { background: #2e7d32; color: white; }
        .btn-primary:hover { background: #1b5e20; }
        .btn-secondary { background: #f5f5f5; color: #333; border: 1px solid #ddd; }
        .btn-secondary:hover { background: #eee; }
        .btn-danger { background: #e53935; color: white; }
        .btn-danger:hover { background: #c62828; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-group { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }

        .search-results { max-height: 300px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; margin-top: 8px; }
        /* Only real choices use .search-result; status lines use .search-result-msg (avoids e2e clicking "No results"). */
        .search-result-msg { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; cursor: default; }
        .search-result-msg:last-child { border-bottom: none; }
        .search-result { padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.15s; }
        .search-result:hover { background: #e8f5e9; }
        .search-result:last-child { border-bottom: none; }
        .search-result.selected { background: #c8e6c9; font-weight: 600; }

        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .status-card { background: #f8f9fa; border-radius: 8px; padding: 16px; border-left: 4px solid #2e7d32; }
        .status-card.warning { border-left-color: #ff9800; }
        .status-card.error { border-left-color: #e53935; }
        .status-card .label { font-size: 0.8em; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
        .status-card .value { font-size: 1.2em; font-weight: 600; margin-top: 4px; word-break: break-word; }
        #status-location { white-space: pre-line; font-size: 1.05em; line-height: 1.45; }

        .termine-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        .termine-table th { background: #f5f5f5; padding: 10px 14px; text-align: left; font-size: 0.85em; color: #666; text-transform: uppercase; }
        .termine-table td { padding: 12px 14px; border-bottom: 1px solid #eee; }
        .termine-table tr:hover { background: #f8f9fa; }
        .cat-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
        .days-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.85em; font-weight: 600; }
        .days-badge.soon { background: #ffebee; color: #c62828; }
        .days-badge.normal { background: #e8f5e9; color: #2e7d32; }
        .days-badge.far { background: #f5f5f5; color: #666; }

        .intro-box { margin-bottom: 20px; font-size: 0.95em; }
        .intro-details { padding: 0; }
        .intro-details > summary { cursor: pointer; list-style: none; padding: 12px 16px; }
        .intro-details > summary::-webkit-details-marker { display: none; }
        .intro-details > summary::before { content: '▶ '; color: #1565c0; display: inline-block; width: 1.1em; }
        .intro-details[open] > summary::before { content: '▼ '; }
        .intro-details > summary .intro-summary-title { display: block; font-weight: 600; }
        .intro-details > summary .intro-summary-hint { display: block; font-size: 0.85em; font-weight: normal; opacity: 0.85; margin-top: 0.2em; }
        .intro-details .intro-body { padding: 0 16px 12px; border-top: 1px solid rgba(21,101,192,0.2); }
        .intro-box .intro-lead { margin: 0.5em 0 0.35em; }
        .intro-box .intro-steps { margin: 0.35em 0 0; padding-left: 1.35rem; }
        .intro-box .intro-steps li { margin: 0.4em 0; }

        .log-output { background: #1a1a2e; color: #e0e0e0; padding: 16px; border-radius: 8px; font-family: 'Fira Code', 'Cascadia Code', monospace; font-size: 0.85em; line-height: 1.6; max-height: 500px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word; }
        .log-output .log-info { color: #4fc3f7; }
        .log-output .log-warn { color: #ffb74d; }
        .log-output .log-error { color: #ef5350; }

        .alert { padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 0.9em; }
        .alert-success { background: #e8f5e9; color: #1b5e20; border: 1px solid #c8e6c9; }
        .alert-error { background: #ffebee; color: #c62828; border: 1px solid #ffcdd2; }
        .alert-info { background: #e3f2fd; color: #1565c0; border: 1px solid #bbdefb; }

        .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.6s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .selected-location { background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
        .selected-location strong { color: #2e7d32; }
WASTE_CSS;

if ($use_loxberry_frame) {
    // Injected into <head> via LB template (global $htmlhead). Stock jQuery (1.12) is already loaded — do not add a second jQuery.
    global $htmlhead;
    global $navbar;
    $htmlhead = '<style>' . $waste_plugin_css . "</style>\n";
    $navbar = [];
    $tabKeys = [
        'status' => 'TAB_STATUS',
        'location' => 'TAB_LOCATION',
        'settings' => 'TAB_SETTINGS',
        'log' => 'TAB_LOG',
    ];
    $ti = 0;
    foreach ($tabKeys as $tk => $i18k) {
        $navbar[$ti++] = [
            'Name' => AbfallioI18N::t('TABS', $i18k),
            'URL' => abfallio_tab_href($tk, $activeLang),
            'active' => ($tab === $tk) ? 1 : 0,
        ];
    }
    LBWeb::lbheader(
        AbfallioI18N::t('COMMON', 'PLUGIN_TITLE'),
        '',
        ''
    );
} else {
    ?>
<!DOCTYPE html>
<html lang="<?= htmlspecialchars($activeLang) ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars(AbfallioI18N::t('COMMON', 'PLUGIN_TITLE')) ?> - Plugin</title>
    <style>
<?= $waste_plugin_css ?>
    </style>
</head>
<body>
<?php
}
?>
<div class="plugin-container<?= $use_loxberry_frame ? ' abfallio-lb-embed' : '' ?>" data-active-tab="<?= htmlspecialchars($tab, ENT_QUOTES, 'UTF-8') ?>">
    <div class="plugin-header">
        <img src="icon_64.png" alt="<?= htmlspecialchars(AbfallioI18N::t('COMMON', 'PLUGIN_TITLE')) ?>" onerror="this.style.display='none'">
        <div>
            <h1><?= htmlspecialchars(AbfallioI18N::t('COMMON', 'PLUGIN_TITLE')) ?></h1>
            <div class="subtitle"><?= htmlspecialchars(AbfallioI18N::t('COMMON', 'PLUGIN_SUBTITLE')) ?></div>
        </div>
        <label class="lang-switch">
            <span><?= htmlspecialchars(AbfallioI18N::t('COMMON', 'LANGUAGE_LABEL')) ?>:</span>
            <select id="lang-switch" onchange="onLangChange(this.value)">
                <?php foreach ($availableLangs as $lc): ?>
                    <option value="<?= htmlspecialchars($lc) ?>"<?= $lc === $activeLang ? ' selected' : '' ?>>
                        <?= htmlspecialchars(AbfallioI18N::t('COMMON', 'LANGUAGE_OPTION_' . $lc, strtoupper($lc))) ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </label>
    </div>

<?php
if (!$use_loxberry_frame) {
    $tabKeys = [
        'status' => 'TAB_STATUS',
        'location' => 'TAB_LOCATION',
        'settings' => 'TAB_SETTINGS',
        'log' => 'TAB_LOG',
    ];
    echo '<nav class="abfallio-subnav" role="tablist" aria-label="Sections">';
    foreach ($tabKeys as $tk => $i18k) {
        $u = htmlspecialchars(abfallio_tab_href($tk, $activeLang), ENT_QUOTES, 'UTF-8');
        $cls = 'abfallio-tab' . ($tab === $tk ? ' active' : '');
        echo '<a role="tab" class="' . htmlspecialchars($cls, ENT_QUOTES, 'UTF-8') . '" href="' . $u . '">' .
            htmlspecialchars(AbfallioI18N::t('TABS', $i18k)) . '</a>';
    }
    echo "</nav>\n";
}
?>

    <!-- STATUS TAB -->
    <div class="tab-content<?= $tab === 'status' ? ' active' : '' ?>" id="tab-status">
        <div id="status-alert"></div>
        <details class="alert alert-info intro-box intro-details" id="abfallio-getting-started">
            <summary>
                <span class="intro-summary-title"><?= htmlspecialchars(AbfallioI18N::t('INTRO', 'SUMMARY', AbfallioI18N::t('INTRO', 'TITLE'))) ?></span>
                <?php
                $introHint = trim((string) AbfallioI18N::t('INTRO', 'SUMMARY_HINT', ''));
                if ($introHint !== '') { ?>
                <span class="intro-summary-hint"><?= htmlspecialchars($introHint) ?></span>
                <?php } ?>
            </summary>
            <div class="intro-body">
                <p class="intro-lead"><?= htmlspecialchars(AbfallioI18N::t('INTRO', 'LEAD')) ?></p>
                <ol class="intro-steps">
                    <li><?= htmlspecialchars(AbfallioI18N::t('INTRO', 'STEP1')) ?></li>
                    <li><?= htmlspecialchars(AbfallioI18N::t('INTRO', 'STEP2')) ?></li>
                    <li><?= htmlspecialchars(AbfallioI18N::t('INTRO', 'STEP3')) ?></li>
                    <li><?= htmlspecialchars(AbfallioI18N::t('INTRO', 'STEP4')) ?></li>
                </ol>
                <p class="intro-footnote" style="margin-top:0.75em;font-size:0.9em;opacity:0.95;"><?= htmlspecialchars(AbfallioI18N::t('INTRO', 'FOOTNOTE')) ?></p>
            </div>
        </details>
        <details class="alert intro-box intro-details" id="abfallio-legal-disclaimer" style="margin-top:12px; border:1px solid #cfd8dc; background:#f5f5f5;">
            <summary style="cursor:pointer; font-size:0.9em; color:#444;"><?= htmlspecialchars(AbfallioI18N::t('INTRO', 'LEGAL_SUMMARY')) ?></summary>
            <div class="intro-body" style="padding-top:0.5rem; font-size:0.86em; line-height:1.55; color:#444;">
                <?php th('INTRO', 'LEGAL_BLOCK_HTML'); ?>
            </div>
        </details>
        <div class="status-grid" id="status-grid">
            <div class="status-card" id="sc-cookie">
                <div class="label"><?= htmlspecialchars(AbfallioI18N::t('STATUS', 'LABEL_DATA_SOURCE')) ?></div>
                <div class="value" id="status-cookie"><?= htmlspecialchars(AbfallioI18N::t('STATUS', 'MSG_STATUS_LOADING')) ?></div>
            </div>
            <div class="status-card" id="sc-location">
                <div class="label"><?= htmlspecialchars(AbfallioI18N::t('STATUS', 'LABEL_REGION_AND_ADDRESS')) ?></div>
                <div class="value" id="status-location">-</div>
            </div>
            <div class="status-card" id="sc-fetch">
                <div class="label"><?= htmlspecialchars(AbfallioI18N::t('STATUS', 'LABEL_LAST_FETCH')) ?></div>
                <div class="value" id="status-fetch">-</div>
            </div>
            <div class="status-card" id="sc-next">
                <div class="label"><?= htmlspecialchars(AbfallioI18N::t('STATUS', 'LABEL_NEXT_FETCH')) ?></div>
                <div class="value" id="status-next">-</div>
            </div>
            <div class="status-card" id="sc-count">
                <div class="label"><?= htmlspecialchars(AbfallioI18N::t('STATUS', 'LABEL_CATEGORIES')) ?></div>
                <div class="value" id="status-count">-</div>
            </div>
            <div class="status-card" id="sc-mqtt">
                <div class="label"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_MQTT_STATUS')) ?></div>
                <div class="value" id="status-mqtt">-</div>
            </div>
        </div>

        <h3 style="margin-bottom: 12px;"><?= htmlspecialchars(AbfallioI18N::t('STATUS', 'TITLE_DATA')) ?></h3>
        <div id="termine-container">
            <p style="color: #999;"><?= htmlspecialchars(AbfallioI18N::t('STATUS', 'MSG_LOADING')) ?></p>
        </div>

        <div class="btn-group">
            <button class="btn btn-primary" id="btn-fetch" onclick="doFetch()"><?= htmlspecialchars(AbfallioI18N::t('STATUS', 'BTN_FETCH')) ?></button>
            <button class="btn btn-secondary" id="btn-download" onclick="downloadJSON()"><?= htmlspecialchars(AbfallioI18N::t('STATUS', 'BTN_DOWNLOAD')) ?></button>
        </div>
    </div>

    <!-- LOCATION TAB: Entsorgungsregion zuerst, dann Straße -->
    <div class="tab-content<?= $tab === 'location' ? ' active' : '' ?>" id="tab-location">
        <p class="abfallio-location-order-hint" style="font-size:0.9em; color:#444; line-height:1.5; margin:0 0 1rem;"><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'HINT_REGION_THEN_STREET')) ?></p>

        <h3 class="section-title" style="margin-top:0; padding-top:0; border-top:none;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'SECTION_API_REGION')) ?></h3>
        <div class="form-group">
            <label for="service-region-search"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_SERVICE_REGION')) ?></label>
            <input type="text" id="service-region-search" value="<?= htmlspecialchars($serviceRegionDisplay) ?>" placeholder="<?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'PLACEHOLDER_SERVICE_REGION')) ?>" autocomplete="off" spellcheck="false">
            <div class="search-results" id="service-region-results" style="display:none;max-width:100%;"></div>
            <input type="hidden" id="service-key" value="<?= htmlspecialchars($serviceKey) ?>">
            <small><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_SERVICE_REGION')) ?></small>
            <div style="margin-top:0.5rem;">
                <button type="button" class="btn btn-secondary" id="btn-refresh-service-map" onclick="refreshServiceMapList()"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'BTN_REFRESH_SERVICE_MAP')) ?></button>
            </div>
            <small style="display:block;margin-top:0.35em;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_SERVICE_MAP_REFRESH')) ?></small>
        </div>

        <details class="abfallio-supported-regions" id="abfallio-supported-regions" data-testid="abfallio-supported-regions" data-region-count="<?= (int) $abfallioServiceMapCount ?>" style="margin:0 0 1rem; border:1px solid #e0e0e0; border-radius:8px; padding:0.75rem 1rem; background:#fafafa;">
            <summary style="cursor:pointer; font-weight:600; color:#2e7d32; font-size:0.95em;">
                <?php
                $sum = AbfallioI18N::t('SETTINGS', 'SUPPORTED_REGIONS_SUMMARY');
                echo htmlspecialchars(str_replace('%n', (string) $abfallioServiceMapCount, $sum));
                ?>
            </summary>
            <p style="font-size:0.88em; color:#555; margin:0.6rem 0 0.5rem; line-height:1.5;"><?php te('SETTINGS', 'SUPPORTED_REGIONS_INTRO'); ?></p>
            <?php
            $srcKey = 'SUPPORTED_REGIONS_SOURCE_' . strtoupper($abfallioServiceMapListSource);
            $srcLine = AbfallioI18N::t('SETTINGS', $srcKey, '');
            if ($srcLine === '') {
                $srcLine = AbfallioI18N::t('SETTINGS', 'SUPPORTED_REGIONS_SOURCE_NONE', '');
            }
            ?>
            <p style="font-size:0.8em; color:#666; margin:0 0 0.5rem;">
                <strong><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'SUPPORTED_REGIONS_LIST_LABEL'), ENT_QUOTES, 'UTF-8') ?></strong>
                <?= $srcLine !== '' ? ' ' . htmlspecialchars($srcLine, ENT_QUOTES, 'UTF-8') : '' ?>
            </p>
            <?php if ($abfallioServiceMapCount > 0) { ?>
            <ul id="abfallio-region-list" class="abfallio-region-name-list" data-testid="abfallio-region-list" style="list-style:disc; padding-left:1.35rem; max-height:min(50vh, 320px); overflow-y:auto; margin:0.25rem 0 0.5rem; font-size:0.88em; line-height:1.45;">
                <?php
                foreach ($abfallioServiceMapDisplay as $row) {
                    if (!is_array($row)) {
                        continue;
                    }
                    $rtitle = (string) ($row['title'] ?? '');
                    $rurl = trim((string) ($row['url'] ?? ''));
                    $href = '';
                    if ($rurl !== '' && (stripos($rurl, 'https://') === 0 || stripos($rurl, 'http://') === 0)) {
                        $href = $rurl;
                    }
                    ?>
                <li class="abfallio-region-list-item" style="margin-bottom:0.4em;">
                    <div class="abfallio-region-title"><?= htmlspecialchars($rtitle, ENT_QUOTES, 'UTF-8') ?></div>
                    <?php if ($href !== '') { ?>
                    <div class="abfallio-region-url" style="font-size:0.9em; margin-top:0.2em; line-height:1.35;">
                        <a href="<?= htmlspecialchars($href, ENT_QUOTES, 'UTF-8') ?>"
                           rel="noopener noreferrer"
                           target="_blank"
                           style="word-break:break-all; color:#1565c0; text-decoration:none; border-bottom:1px solid rgba(21,101,192,0.35);"
                        ><?= htmlspecialchars($href, ENT_QUOTES, 'UTF-8') ?></a>
                    </div>
                    <?php } ?>
                </li>
                <?php } ?>
            </ul>
            <?php } else { ?>
            <p style="color:#b71c1c; font-size:0.88em; margin:0.25rem 0 0.5rem;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'SUPPORTED_REGIONS_EMPTY')) ?></p>
            <?php } ?>
            <p style="font-size:0.78em; color:#666; margin:0.4rem 0 0; line-height:1.5;"><?php th('SETTINGS', 'SUPPORTED_REGIONS_FOOTNOTE'); ?></p>
        </details>

        <details class="abfallio-expert-service" style="margin: 0 0 1rem;">
            <summary style="cursor: pointer; font-size: 0.9em; color: #555;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'EXPERT_SERVICE_TOGGLE')) ?></summary>
            <div class="form-group" style="margin-top:0.75rem; margin-bottom:0;">
                <label for="service-key-expert"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_SERVICE_KEY')) ?></label>
                <input type="text" id="service-key-expert" value="<?= htmlspecialchars($serviceKey) ?>" placeholder="<?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'PLACEHOLDER_SERVICE_KEY')) ?>" maxlength="32" pattern="[0-9a-fA-F]{0,32}" autocomplete="off" inputmode="verbatim" spellcheck="false" style="font-family: ui-monospace, monospace;">
                <small><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_SERVICE_KEY')) ?></small>
            </div>
        </details>

        <div class="form-group" style="margin-bottom:1rem;">
            <button type="button" class="btn btn-primary" id="btn-save-config-from-location" onclick="saveSettings('tab-location')"><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'BTN_SAVE_CONFIG')) ?></button>
            <button type="button" class="btn btn-secondary" id="btn-reset-region" onclick="resetRegion()"><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'BTN_RESET_REGION')) ?></button>
            <small style="display:block; margin-top:0.5em; color:#555;"><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'HELP_SAVE_CONFIG')) ?></small>
            <small style="display:block; margin-top:0.35em; color:#666;"><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'HELP_RESET_REGION')) ?></small>
        </div>

        <h3 class="section-title"><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'SECTION_STREET')) ?></h3>
        <?php if (!empty($location['street_name'])): ?>
        <div class="selected-location">
            <strong><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'CURRENT_LOCATION')) ?></strong>
            <?= htmlspecialchars(trim($location['street_name'] . ' ' . ($location['hnr_name'] ?? ''))) ?>
        </div>
        <?php endif; ?>

        <div class="form-group">
            <label><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'LABEL_SEARCH')) ?></label>
            <input type="text" id="street-search" placeholder="<?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'PLACEHOLDER_SEARCH')) ?>" autocomplete="off">
            <div class="search-results" id="street-results" style="display:none;"></div>
        </div>

        <div class="form-group" id="hnr-group" style="display:none;">
            <label><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'LABEL_HNR')) ?></label>
            <div class="search-results" id="hnr-results"></div>
        </div>

        <div id="location-selection" class="abfallio-location-selection" style="display:none;" data-testid="abfallio-location-selection">
            <div class="alert alert-info">
                <strong><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'SELECTED')) ?></strong>
                <span id="selected-street"></span> <span id="selected-hnr"></span>
            </div>
            <button class="btn btn-primary" onclick="saveLocation()"><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'BTN_SAVE')) ?></button>
        </div>

        <div class="form-group" style="margin-top: 0.75rem;">
            <button type="button" class="btn btn-secondary" id="btn-reset-street" onclick="resetStreetOnly()"><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'BTN_RESET_STREET')) ?></button>
            <small style="display:block; margin-top:0.4em; color:#666;"><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'HELP_RESET_STREET')) ?></small>
        </div>

        <div class="alert alert-info" style="margin-top: 20px;">
            <strong><?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'INFO_DATA_SOURCE_TITLE')) ?></strong>
            <?= htmlspecialchars(AbfallioI18N::t('LOCATION', 'INFO_DATA_SOURCE_TEXT')) ?>
        </div>
    </div>

    <!-- SETTINGS TAB -->
    <div class="tab-content<?= $tab === 'settings' ? ' active' : '' ?>" id="tab-settings">
        <div id="settings-alert"></div>

        <h3 class="section-title" style="margin-top:0; padding-top:0; border-top:none;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'SECTION_FETCHING')) ?></h3>

        <div class="form-row">
            <div class="form-group">
                <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_INTERVAL')) ?></label>
                <input type="number" id="fetch-interval" value="<?= $fetchInterval ?>" min="6" max="168">
            </div>
            <div class="form-group">
                <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_FUZZ')) ?></label>
                <input type="number" id="fetch-fuzz" value="<?= $fetchFuzz ?>" min="0" max="360">
                <small><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_FUZZ')) ?></small>
            </div>
        </div>

        <div class="form-group">
            <label for="categories-filter"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_CATEGORIES')) ?></label>
            <input type="text" id="categories-filter" list="categories-datalist" placeholder="<?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'PLACEHOLDER_CATEGORIES')) ?>" value="<?= htmlspecialchars($categoriesFilter) ?>" autocomplete="off">
            <datalist id="categories-datalist"></datalist>
            <small><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_CATEGORIES')) ?></small>
            <div id="category-filter-checkboxes" class="category-filter-checkboxes" role="group" aria-label="<?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'ARIA_CATEGORIES')) ?>"></div>
        </div>

        <h3 class="section-title"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'SECTION_INTEGRATION')) ?></h3>
        <p style="font-size: 0.9em; color: #444; line-height: 1.5; margin: 0 0 10px;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_INTEGRATION_INTRO')) ?></p>
        <ul style="font-size: 0.9em; color: #444; margin: 0 0 18px; padding-left: 1.25rem; line-height: 1.5;">
            <li style="margin-bottom: 0.4em;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_INTEGRATION_BULLET_LOXONE')) ?></li>
            <li style="margin-bottom: 0.4em;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_INTEGRATION_BULLET_MQTT')) ?></li>
            <li><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_INTEGRATION_BULLET_JSON')) ?></li>
        </ul>

        <h3 class="section-title"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'SECTION_MQTT')) ?></h3>

        <div class="form-group">
            <div class="checkbox-row">
                <input type="checkbox" id="mqtt-enabled"<?= $mqttEnabled ? ' checked' : '' ?>>
                <label for="mqtt-enabled" style="margin-bottom:0;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_MQTT_ENABLE')) ?></label>
            </div>
            <small><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_MQTT')) ?></small>
        </div>

        <div class="form-group">
            <div class="checkbox-row">
                <input type="checkbox" id="mqtt-use-loxberry"<?= $mqttUseLb ? ' checked' : '' ?>>
                <label for="mqtt-use-loxberry" style="margin-bottom:0;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_MQTT_USE_LOXBERRY')) ?></label>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_MQTT_HOST')) ?></label>
                <input type="text" id="mqtt-host" value="<?= htmlspecialchars($mqttHost) ?>" placeholder="localhost">
            </div>
            <div class="form-group">
                <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_MQTT_PORT')) ?></label>
                <input type="number" id="mqtt-port" value="<?= $mqttPort ?>" min="1" max="65535">
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_MQTT_USER')) ?></label>
                <input type="text" id="mqtt-user" value="<?= htmlspecialchars($mqttUser) ?>" autocomplete="off">
            </div>
            <div class="form-group">
                <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_MQTT_PASSWORD')) ?></label>
                <input type="password" id="mqtt-password" value="<?= htmlspecialchars($mqttPassword) ?>" autocomplete="new-password">
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_MQTT_TOPIC')) ?></label>
                <input type="text" id="mqtt-topic" value="<?= htmlspecialchars($mqttTopic) ?>" placeholder="loxberry/abfallio">
            </div>
            <div class="form-group">
                <label>&nbsp;</label>
                <div class="checkbox-row">
                    <input type="checkbox" id="mqtt-retain"<?= $mqttRetain ? ' checked' : '' ?>>
                    <label for="mqtt-retain" style="margin-bottom:0;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_MQTT_RETAIN')) ?></label>
                </div>
            </div>
        </div>

        <button class="btn btn-primary" onclick="saveSettings()"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'BTN_SAVE')) ?></button>

        <h3 class="section-title"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'SECTION_LOXONE')) ?></h3>

        <div class="form-group">
            <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_LOXONE_ENDPOINT')) ?></label>
            <input type="text" readonly value="http://&lt;loxberry-ip&gt;/plugins/<?= htmlspecialchars($lbplugindir) ?>/loxone.php" style="background: #f8f9fa; color: #333; font-family: monospace;">
            <small><?= AbfallioI18N::t('SETTINGS', 'HELP_LOXONE_ENDPOINT') ?></small>
        </div>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-top: 12px;">
            <p style="font-weight: 600; margin-bottom: 8px;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'TITLE_LOXONE_PATTERNS')) ?></p>
            <p style="font-size: 0.85em; color: #666; margin-bottom: 12px;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_LOXONE_PATTERNS')) ?></p>
            <table style="width: 100%; font-size: 0.85em; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #ddd;">
                        <th style="text-align: left; padding: 6px 8px;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'COL_LABEL')) ?></th>
                        <th style="text-align: left; padding: 6px 8px;"><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'COL_PATTERN')) ?></th>
                    </tr>
                </thead>
                <tbody id="loxone-patterns">
                    <tr><td style="padding: 6px 8px; border-bottom: 1px solid #eee;">Restabfall (Days)</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-family: monospace;">\iRestabfall_Days: \i\v</td></tr>
                    <tr><td style="padding: 6px 8px; border-bottom: 1px solid #eee;">Biotonne (Days)</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-family: monospace;">\iBiotonne_Days: \i\v</td></tr>
                    <tr><td style="padding: 6px 8px; border-bottom: 1px solid #eee;">Altpapier (Days)</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #eee; font-family: monospace;">\iAltpapier_Days: \i\v</td></tr>
                </tbody>
            </table>
        </div>

        <div class="form-group" style="margin-top: 16px;">
            <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_LOXONE_SINGLE')) ?></label>
            <input type="text" readonly value="http://&lt;loxberry-ip&gt;/plugins/<?= htmlspecialchars($lbplugindir) ?>/loxone.php?cat=&lt;category&gt;" style="background: #f8f9fa; color: #333; font-family: monospace;">
            <small><?= AbfallioI18N::t('SETTINGS', 'HELP_LOXONE_SINGLE') ?></small>
        </div>

        <div class="form-group" style="margin-top: 8px;">
            <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_LOXONE_LIST')) ?></label>
            <input type="text" readonly value="http://&lt;loxberry-ip&gt;/plugins/<?= htmlspecialchars($lbplugindir) ?>/loxone.php?format=list" style="background: #f8f9fa; color: #333; font-family: monospace;">
            <small><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_LOXONE_LIST')) ?></small>
        </div>

        <div class="form-group" style="margin-top: 8px;">
            <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_LOXONE_JSON')) ?></label>
            <input type="text" readonly value="http://&lt;loxberry-ip&gt;/plugins/<?= htmlspecialchars($lbplugindir) ?>/index.php" style="background: #f8f9fa; color: #333; font-family: monospace;">
            <small><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_LOXONE_JSON')) ?></small>
        </div>

        <div class="form-group" style="margin-top: 8px;">
            <label><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'LABEL_DEBUG')) ?></label>
            <input type="text" readonly value="http://&lt;loxberry-ip&gt;/plugins/<?= htmlspecialchars($lbplugindir) ?>/loxone.php?debug" style="background: #f8f9fa; color: #333; font-family: monospace;">
            <small><?= htmlspecialchars(AbfallioI18N::t('SETTINGS', 'HELP_DEBUG')) ?></small>
        </div>
    </div>

    <!-- LOG TAB -->
    <div class="tab-content<?= $tab === 'log' ? ' active' : '' ?>" id="tab-log">
        <div class="btn-group" style="margin-bottom: 16px; margin-top: 0;">
            <button class="btn btn-secondary" onclick="loadLog()"><?= htmlspecialchars(AbfallioI18N::t('LOG', 'BTN_REFRESH')) ?></button>
            <button class="btn btn-danger" onclick="clearLog()"><?= htmlspecialchars(AbfallioI18N::t('LOG', 'BTN_CLEAR')) ?></button>
        </div>
        <div class="log-output" id="log-content"><?= htmlspecialchars(AbfallioI18N::t('LOG', 'MSG_LOADING')) ?></div>
    </div>
</div>

<script>
var ajaxUrl = 'ajax.php';
var selectedStreet = null;
var selectedHnr = null;
/** Last termine object from status (for category UI refresh). */
var abfallioLastTermine = {};
var L = <?= $dictJson ?>;
function tt(section, key, fallback) {
    if (L && L[section] && L[section][key] != null) return L[section][key];
    return fallback != null ? fallback : (section + '.' + key);
}

function onLangChange(lc) {
    var url = new URL(window.location.href);
    url.searchParams.set('lang', lc);
    window.location.href = url.toString();
}

function abfallioFormBody(obj) {
    var p = new URLSearchParams();
    Object.keys(obj).forEach(function(k) {
        var v = obj[k];
        p.set(k, v != null ? String(v) : '');
    });
    return p;
}

function abfallioGetJson(params) {
    var u = new URL(ajaxUrl, window.location.href);
    Object.keys(params).forEach(function(k) {
        u.searchParams.set(k, params[k]);
    });
    return fetch(u.toString(), { credentials: 'same-origin' })
        .then(function(r) {
            if (!r.ok) {
                return r.text().then(function(t) {
                    throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 200));
                });
            }
            return r.json();
        });
}

function abfallioPostForm(obj) {
    return fetch(ajaxUrl, {
        method: 'POST',
        body: abfallioFormBody(obj),
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).then(function(r) {
        if (!r.ok) {
            return r.text().then(function(t) {
                throw new Error('HTTP ' + r.status);
            });
        }
        return r.json();
    });
}

function abfallioFetchWithTimeout(getParams, timeoutMs) {
    var c = new AbortController();
    var t = setTimeout(function() { c.abort(); }, timeoutMs);
    var u = new URL(ajaxUrl, window.location.href);
    Object.keys(getParams).forEach(function(k) { u.searchParams.set(k, getParams[k]); });
    return fetch(u.toString(), { credentials: 'same-origin', signal: c.signal })
        .finally(function() { clearTimeout(t); })
        .then(function(r) {
            if (!r.ok) return r.text().then(function(tx) { throw new Error(tx.slice(0, 200)); });
            return r.json();
        });
}

/* Tabs: server-rendered (?tab=) + LoxBerry $navbar; no client-only .tab buttons. */
(function initAbfallioFromUrl() {
    var pc = document.querySelector('.plugin-container');
    var at = (pc && pc.getAttribute('data-active-tab')) || 'status';
    var u = new URL(window.location.href);
    if (at === 'status') {
        if (u.searchParams.get('dofetch') === '1') {
            u.searchParams.delete('dofetch');
            if (window.history && window.history.replaceState) {
                window.history.replaceState({}, '', u.toString());
            }
            doFetch();
        } else {
            loadStatus();
        }
    } else if (at === 'log') {
        loadLog();
    } else if (at === 'settings') {
        abfallioGetJson({ action: 'status' })
            .then(function(data) {
                if (data && !data.error) {
                    abfallioLastTermine = (data.cached_data && data.cached_data.termine) || {};
                    abfallioRefreshCategoryUI(abfallioLastTermine);
                }
            })
            .catch(function() { /* optional */ });
    }
})();

function abfallioSelectedFilterNames() {
    var inp = document.getElementById('categories-filter');
    if (!inp) return [];
    var raw = inp.value.trim();
    if (!raw) return [];
    return raw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

function abfallioSyncCheckboxesToInput() {
    var box = document.getElementById('category-filter-checkboxes');
    if (!box) return;
    var names = [];
    box.querySelectorAll('input.cat-filter-cb:checked').forEach(function(cb) {
        names.push(cb.value);
    });
    var inp = document.getElementById('categories-filter');
    if (!inp) return;
    if (names.length === 0) {
        inp.value = '';
    } else {
        inp.value = names.join(', ');
    }
}

function abfallioRefreshCategoryUI(termine) {
    termine = termine || {};
    var keys = Object.keys(termine).sort(function(a, b) { return a.localeCompare(b); });
    var dl = document.getElementById('categories-datalist');
    if (dl) {
        dl.innerHTML = '';
        keys.forEach(function(k) {
            var o = document.createElement('option');
            o.value = k;
            dl.appendChild(o);
        });
    }
    var box = document.getElementById('category-filter-checkboxes');
    if (!box) return;
    var selected = {};
    abfallioSelectedFilterNames().forEach(function(n) { selected[n] = true; });
    var hasFilter = Object.keys(selected).length > 0;
    box.innerHTML = '';
    if (keys.length === 0) {
        var p = document.createElement('p');
        p.style.cssText = 'color:#999;font-size:0.85em;margin:0;';
        p.textContent = tt('SETTINGS', 'MSG_CATEGORIES_NEED_FETCH');
        box.appendChild(p);
        return;
    }
    keys.forEach(function(k, idx) {
        var id = 'abfallio-cat-' + idx;
        var row = document.createElement('label');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'cat-filter-cb';
        cb.id = id;
        cb.value = k;
        cb.checked = hasFilter ? !!selected[k] : false;
        cb.addEventListener('change', function() { abfallioSyncCheckboxesToInput(); });
        row.appendChild(cb);
        var span = document.createElement('span');
        span.textContent = k;
        row.appendChild(span);
        box.appendChild(row);
    });
}

var categoriesFilterInputBound = false;
function abfallioBindCategoriesFilterInput() {
    if (categoriesFilterInputBound) return;
    var inp = document.getElementById('categories-filter');
    if (!inp) return;
    categoriesFilterInputBound = true;
    inp.addEventListener('change', function() {
        abfallioRefreshCategoryUI(abfallioLastTermine);
    });
}
abfallioBindCategoriesFilterInput();

var serviceRegionTimer = null;
var serviceRegionSearchInput = document.getElementById('service-region-search');
if (serviceRegionSearchInput) {
    serviceRegionSearchInput.addEventListener('input', function() {
        var q = this.value.trim();
        clearTimeout(serviceRegionTimer);
        if (q.length < 2) {
            var res = document.getElementById('service-region-results');
            if (res) res.style.display = 'none';
            return;
        }
        serviceRegionTimer = setTimeout(function() { searchServiceRegion(q); }, 350);
    });
}
var serviceKeyExpert = document.getElementById('service-key-expert');
if (serviceKeyExpert) {
    function syncExpertToServiceKey() {
        var sk = document.getElementById('service-key');
        if (!sk) return;
        var v = (serviceKeyExpert && serviceKeyExpert.value) ? serviceKeyExpert.value.trim().toLowerCase() : '';
        var only = v.replace(/[^a-f0-9]/g, '').slice(0, 32);
        if (v === '') {
            sk.value = '';
        } else {
            sk.value = only;
        }
    }
    serviceKeyExpert.addEventListener('input', syncExpertToServiceKey);
    serviceKeyExpert.addEventListener('change', syncExpertToServiceKey);
}

function searchServiceRegion(q) {
    abfallioGetJson({ action: 'search_service', q: q })
        .then(function(data) {
            var el = document.getElementById('service-region-results');
            if (!el) return;
            if (!data || data.error || !Array.isArray(data) || data.length === 0) {
                el.innerHTML = '<div class="search-result-msg" style="color:#999;">' + tt('LOCATION', 'MSG_NO_RESULTS') + '</div>';
                el.style.display = 'block';
                return;
            }
            el.innerHTML = '';
            data.forEach(function(item) {
                var div = document.createElement('div');
                div.className = 'search-result';
                div.textContent = item.name || item.title;
                div.onclick = function() { selectServiceRegion(item); };
                el.appendChild(div);
            });
            el.style.display = 'block';
        })
        .catch(function() {
            var el = document.getElementById('service-region-results');
            if (!el) return;
            el.innerHTML = '<div class="search-result-msg" style="color:#c62828;">' + tt('LOCATION', 'MSG_SEARCH_FAILED') + '</div>';
            el.style.display = 'block';
        });
}

function selectServiceRegion(item) {
    var hid = document.getElementById('service-key');
    var vis = document.getElementById('service-region-search');
    var exp = document.getElementById('service-key-expert');
    if (hid) hid.value = (item.id || '').toLowerCase();
    if (vis) vis.value = item.name || item.title || '';
    if (exp) exp.value = hid ? hid.value : '';
    var el = document.getElementById('service-region-results');
    if (el) el.style.display = 'none';
}

var searchTimer = null;
document.getElementById('street-search').addEventListener('input', function() {
    var q = this.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 3) {
        document.getElementById('street-results').style.display = 'none';
        return;
    }
    searchTimer = setTimeout(function() { searchStreet(q); }, 400);
});

function searchStreet(q) {
    abfallioGetJson({ action: 'search_street', q: q })
        .then(function(data) {
            var el = document.getElementById('street-results');
            if (data && data.error === 'service_key_required') {
                el.innerHTML = '<div class="search-result-msg" style="color:#b71c1c;">' + tt('LOCATION', 'MSG_SERVICE_KEY_REQUIRED') + '</div>';
                el.style.display = 'block';
                return;
            }
            if (!data || data.error || !Array.isArray(data) || data.length === 0) {
                el.innerHTML = '<div class="search-result-msg" style="color:#999;">' + tt('LOCATION', 'MSG_NO_RESULTS') + '</div>';
                el.style.display = 'block';
                return;
            }
            el.innerHTML = '';
            data.forEach(function(item) {
                var div = document.createElement('div');
                div.className = 'search-result';
                div.textContent = item.name;
                div.onclick = function() { selectStreet(item); };
                el.appendChild(div);
            });
            el.style.display = 'block';
        })
        .catch(function() {
            var el = document.getElementById('street-results');
            el.innerHTML = '<div class="search-result-msg" style="color:#c62828;">' + tt('LOCATION', 'MSG_SEARCH_FAILED') + '</div>';
            el.style.display = 'block';
        });
}

function selectStreet(item) {
    selectedStreet = item;
    selectedHnr = null;
    document.getElementById('street-results').style.display = 'none';
    document.getElementById('street-search').value = item.name;
    document.getElementById('selected-street').textContent = item.name;
    document.getElementById('selected-hnr').textContent = '';
    document.getElementById('location-selection').style.display = 'none';

    document.getElementById('hnr-group').style.display = 'block';
    document.getElementById('hnr-results').innerHTML =
        '<div class="search-result-msg" style="color:#999;">' + tt('LOCATION','HNR_LOADING') + '</div>';

    abfallioGetJson({ action: 'search_hnr', street_id: item.id })
        .then(function(data) {
            var el = document.getElementById('hnr-results');
            if (data && data.error === 'service_key_required') {
                el.innerHTML = '<div class="search-result-msg" style="color:#b71c1c;">' + tt('LOCATION', 'MSG_SERVICE_KEY_REQUIRED') + '</div>';
                return;
            }
            if (!data || data.error || !Array.isArray(data) || data.length === 0) {
                el.innerHTML = '<div class="search-result-msg" style="color:#999;">' + tt('LOCATION', 'HNR_NONE_FOUND') + '</div>';
                return;
            }
            if (data[0] && data[0].id === '__not_needed__') {
                selectedHnr = { id: '', name: '' };
                el.innerHTML = '<div class="search-result selected">' + tt('LOCATION', 'HNR_NOT_REQUIRED') + '</div>';
                document.getElementById('selected-hnr').textContent = '';
                document.getElementById('location-selection').style.display = 'block';
                return;
            }
            el.innerHTML = '';
            data.forEach(function(h) {
                var div = document.createElement('div');
                div.className = 'search-result';
                div.textContent = h.name;
                div.onclick = function(ev) { selectHnr(h, ev); };
                el.appendChild(div);
            });
        });
}

function selectHnr(item, ev) {
    selectedHnr = item;
    document.querySelectorAll('#hnr-results .search-result').forEach(function(r) { r.classList.remove('selected'); });
    if (ev && ev.target) ev.target.classList.add('selected');
    document.getElementById('selected-hnr').textContent = item.name;
    document.getElementById('location-selection').style.display = 'block';
}

function saveLocation() {
    if (!selectedStreet || !selectedHnr) {
        alert(tt('LOCATION','MSG_PICK_BOTH'));
        return;
    }
    var data = {
        action: 'save_location',
        kommune_id: '',
        street_id: selectedStreet.id,
        street_name: selectedStreet.name,
        hnr_id: selectedHnr.id,
        hnr_name: selectedHnr.name
    };
    abfallioPostForm(data)
        .then(function(resp) {
            if (resp.success) {
                showAlert('tab-location', tt('LOCATION', 'MSG_SAVED'), 'success');
                setTimeout(function() {
                    var u = new URL(window.location.href);
                    u.searchParams.set('tab', 'status');
                    u.searchParams.set('dofetch', '1');
                    window.location.href = u.toString();
                }, 800);
            } else {
                showAlert('tab-location', 'Error: ' + (resp.error || 'Unknown'), 'error');
            }
        })
        .catch(function() {
            showAlert('tab-location', tt('STATUS', 'MSG_CONNECTION_ERROR'), 'error');
        });
}

function refreshServiceMapList() {
    var btn = document.getElementById('btn-refresh-service-map');
    if (btn) {
        btn.disabled = true;
    }
    abfallioGetJson({ action: 'refresh_service_map' })
        .then(function(resp) {
            if (btn) {
                btn.disabled = false;
            }
            if (resp && resp.success) {
                var n = (resp && typeof resp.count === 'number') ? resp.count : 0;
                var msg = tt('SETTINGS', 'MSG_SERVICE_MAP_REFRESHED').split('%n').join(String(n));
                showAlert('tab-location', msg, 'success');
            } else {
                var err = (resp && resp.error) ? String(resp.error) : 'Refresh failed';
                showAlert('tab-location', err, 'error');
            }
        })
        .catch(function() {
            if (btn) {
                btn.disabled = false;
            }
            showAlert('tab-location', tt('STATUS', 'MSG_CONNECTION_ERROR'), 'error');
        });
}

function saveSettings(alertTab, onSuccess) {
    var tab = alertTab || 'tab-settings';
    var filter = document.getElementById('categories-filter').value.trim();
    var filterArr = filter ? filter.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
    abfallioPostForm({
        action: 'save_settings',
        service_key: document.getElementById('service-key').value.trim(),
        fetch_interval_hours: document.getElementById('fetch-interval').value,
        fetch_fuzz_minutes: document.getElementById('fetch-fuzz').value,
        categories_filter: JSON.stringify(filterArr),
        mqtt_enabled: document.getElementById('mqtt-enabled').checked ? '1' : '0',
        mqtt_use_loxberry_broker: document.getElementById('mqtt-use-loxberry').checked ? '1' : '0',
        mqtt_host: document.getElementById('mqtt-host').value,
        mqtt_port: document.getElementById('mqtt-port').value,
        mqtt_user: document.getElementById('mqtt-user').value,
        mqtt_password: document.getElementById('mqtt-password').value,
        mqtt_topic_prefix: document.getElementById('mqtt-topic').value,
        mqtt_retain: document.getElementById('mqtt-retain').checked ? '1' : '0'
    })
        .then(function(resp) {
            if (resp.success) {
                showAlert(tab, tt('SETTINGS', 'MSG_SAVED'), 'success');
                if (typeof onSuccess === 'function') {
                    onSuccess();
                }
            } else {
                var err = (resp.error || 'Unknown');
                if (resp.code === 'service_key') {
                    err = tt('SETTINGS', 'MSG_SERVICE_KEY_INVALID');
                }
                showAlert(tab, 'Error: ' + err, 'error');
            }
        })
        .catch(function() {
            showAlert(tab, tt('STATUS', 'MSG_CONNECTION_ERROR'), 'error');
        });
}

function resetRegion() {
    if (!confirm(tt('LOCATION', 'CONFIRM_RESET_REGION'))) {
        return;
    }
    document.getElementById('service-key').value = '';
    document.getElementById('service-region-search').value = '';
    var exp = document.getElementById('service-key-expert');
    if (exp) {
        exp.value = '';
    }
    saveSettings('tab-location', function() {
        window.location.reload();
    });
}

function resetStreetOnly() {
    if (!confirm(tt('LOCATION', 'CONFIRM_RESET_STREET'))) {
        return;
    }
    abfallioPostForm({ action: 'reset_location' })
        .then(function(resp) {
            if (resp && resp.success) {
                window.location.reload();
            } else {
                showAlert('tab-location', 'Error: ' + (resp && resp.error ? resp.error : 'Unknown'), 'error');
            }
        })
        .catch(function() {
            showAlert('tab-location', tt('STATUS', 'MSG_CONNECTION_ERROR'), 'error');
        });
}

function doFetch() {
    var btn = document.getElementById('btn-fetch');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ' + tt('STATUS','BTN_FETCHING');
    abfallioFetchWithTimeout({ action: 'fetch_now' }, 30000)
        .then(function(resp) {
            btn.disabled = false;
            btn.textContent = tt('STATUS', 'BTN_FETCH');
            if (resp.error) {
                showAlert('tab-status', 'Error: ' + resp.error, 'error');
            } else {
                showAlert('tab-status', tt('STATUS', 'MSG_FETCH_OK'), 'success');
                loadStatus();
            }
        })
        .catch(function() {
            btn.disabled = false;
            btn.textContent = tt('STATUS', 'BTN_FETCH');
            showAlert('tab-status', tt('STATUS', 'MSG_CONNECTION_ERROR'), 'error');
        });
}

function downloadJSON() {
    window.open(ajaxUrl + '?action=download_json', '_blank');
}

function loadStatus() {
    abfallioGetJson({ action: 'status' })
        .then(function(data) {
        if (data.error) {
            document.getElementById('status-cookie').textContent = tt('STATUS','MSG_STATUS_ERROR');
            document.getElementById('sc-cookie').className = 'status-card error';
            showAlert('tab-status', tt('STATUS','MSG_STATUS_ERROR') + ': ' + data.error, 'error');
            return;
        }

        document.getElementById('status-cookie').textContent = data.api_mode || tt('STATUS', 'DATA_SOURCE_VALUE');
        document.getElementById('sc-cookie').className = 'status-card';
        var locEl = document.getElementById('status-location');
        var locCard = document.getElementById('sc-location');
        if (typeof data.has_region === 'boolean' && typeof data.has_street === 'boolean') {
            var lineR = data.has_region
                ? tt('STATUS', 'SETUP_REGION_OK').split('%s').join(data.region_title || '—')
                : tt('STATUS', 'SETUP_REGION_MISSING');
            var lineS = data.has_street
                ? tt('STATUS', 'SETUP_STREET_OK').split('%s').join((data.location || '—').trim() || '—')
                : tt('STATUS', 'SETUP_STREET_MISSING');
            locEl.textContent = lineR + '\n' + lineS;
            if (data.has_region && data.has_street) {
                locCard.className = 'status-card';
            } else {
                locCard.className = 'status-card warning';
            }
        } else {
            locEl.textContent = data.location_api || data.location || '-';
            locCard.className = 'status-card';
        }
        document.getElementById('status-fetch').textContent = data.last_fetch || '-';
        document.getElementById('status-next').textContent = data.next_fetch_due || '-';
        document.getElementById('status-count').textContent = data.termine_count || '0';

        var mqttEl = document.getElementById('status-mqtt');
        var mqttCard = document.getElementById('sc-mqtt');
        if (!data.mqtt || data.mqtt.last === '') {
            mqttEl.textContent = tt('SETTINGS','MQTT_STATUS_NEVER');
            mqttCard.className = 'status-card';
        } else if (data.mqtt.ok) {
            mqttEl.textContent = tt('SETTINGS','MQTT_STATUS_OK') + ' (' + data.mqtt.last + ')';
            mqttCard.className = 'status-card';
        } else {
            mqttEl.textContent = tt('SETTINGS','MQTT_STATUS_FAIL') + ' (' + data.mqtt.last + ')';
            mqttCard.className = 'status-card error';
        }

        var termine = (data.cached_data || {}).termine || {};
        abfallioLastTermine = termine;
        abfallioRefreshCategoryUI(termine);
        var keys = Object.keys(termine);
        if (keys.length === 0) {
            document.getElementById('termine-container').innerHTML =
                '<p style="color:#999;">' + tt('STATUS','MSG_NO_DATA') + '</p>';
            return;
        }
        var html = '<table class="termine-table"><thead><tr>' +
            '<th>' + tt('STATUS','COL_CATEGORY') + '</th>' +
            '<th>' + tt('STATUS','COL_DATE') + '</th>' +
            '<th>' + tt('STATUS','COL_WEEKDAY') + '</th>' +
            '<th>' + tt('STATUS','COL_WEEKDAY_NUM') + '</th>' +
            '<th>' + tt('STATUS','COL_DAYS') + '</th></tr></thead><tbody>';
        keys.forEach(function(name) {
            var entry = termine[name];
            var badgeClass = entry.tage <= 2 ? 'soon' : (entry.tage <= 7 ? 'normal' : 'far');
            var wd = entry.wochentag != null ? entry.wochentag : '–';
            var wn = (entry.wochentag_num != null && entry.wochentag_num > 0) ? String(entry.wochentag_num) : '–';
            html += '<tr><td><span class="cat-dot" style="background:' + (entry.color || '#999') + '"></span>' +
                name + '</td><td>' + entry.datum + '</td><td>' + wd + '</td><td>' + wn +
                '</td><td><span class="days-badge ' + badgeClass + '">' + entry.tage + '</span></td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById('termine-container').innerHTML = html;
    })
        .catch(function(err) {
        document.getElementById('status-cookie').textContent = tt('STATUS', 'MSG_STATUS_ERROR');
        document.getElementById('sc-cookie').className = 'status-card error';
        var msg = err && err.message ? err.message : String(err);
        document.getElementById('termine-container').innerHTML =
            '<p style="color:#c62828;">' + tt('STATUS', 'MSG_LOAD_FAILED') + ': ' + msg.substring(0, 200) + '</p>';
    });
}

function loadLog() {
    abfallioGetJson({ action: 'log' })
        .then(function(data) {
            var el = document.getElementById('log-content');
            if (!data.log || data.log.trim() === '') {
                el.textContent = tt('LOG', 'MSG_EMPTY');
                return;
            }
            el.innerHTML = data.log
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/\[INFO\]/g, '<span class="log-info">[INFO]</span>')
                .replace(/\[WARNING\]/g, '<span class="log-warn">[WARNING]</span>')
                .replace(/\[ERROR\]/g, '<span class="log-error">[ERROR]</span>');
            el.scrollTop = el.scrollHeight;
        });
}

function clearLog() {
    if (!confirm(tt('LOG','CONFIRM_CLEAR'))) return;
    abfallioGetJson({ action: 'clear_log' }).then(function() { loadLog(); });
}

function showAlert(tabId, message, type) {
    var container = document.getElementById(tabId);
    if (!container) return;
    var alertEl = container.querySelector('.abfallio-dynamic-alert');
    if (!alertEl) {
        alertEl = document.createElement('div');
        alertEl.className = 'abfallio-dynamic-alert';
        container.insertBefore(alertEl, container.firstChild);
    }
    alertEl.className = 'alert alert-' + type + ' abfallio-dynamic-alert';
    alertEl.textContent = message;
    setTimeout(function() { if (alertEl && alertEl.parentNode) alertEl.remove(); }, 5000);
}

</script>
<?php
if ($use_loxberry_frame) {
    LBWeb::lbfooter();
} else {
    echo "</body></html>\n";
}
