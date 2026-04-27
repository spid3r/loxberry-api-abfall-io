<?php
/**
 * Public waste-data page: HTML in a normal browser, JSON for apps and scripts.
 * HTML help: static public_help_{lang}.html in this folder (no i18n bootstrap on public).
 *
 * JSON: add ?format=json or use a non-browser client (curl, Loxone, etc.).
 */

require_once __DIR__ . '/waste_data_paths.php';

[$cacheFile, $triedPaths] = abfallio_find_abfall_data_json();
$pluginFolder = getenv('LBPPLUGINDIR') ?: 'abfallio';

$lbhomedir = getenv('LBHOMEDIR') ?: (is_dir('/opt/loxberry') ? '/opt/loxberry' : '');
$lbplugindir = getenv('LBPPLUGINDIR') ?: 'abfallio';
if ($lbhomedir) {
    $plugin_lang_dir = $lbhomedir . '/templates/plugins/' . $lbplugindir . '/lang';
    if (!is_dir($plugin_lang_dir)) {
        $plugin_lang_dir = dirname(__DIR__, 2) . '/templates/lang';
    }
} else {
    $plugin_lang_dir = dirname(__DIR__, 2) . '/templates/lang';
}

$config_file = $lbhomedir
    ? $lbhomedir . '/config/plugins/' . $lbplugindir . '/abfall.json'
    : dirname(__DIR__, 2) . '/config/abfall.json';
$cfg = (is_readable($config_file))
    ? (json_decode((string) file_get_contents($config_file), true) ?: [])
    : [];

$accept = $_SERVER['HTTP_ACCEPT'] ?? '';
$forceJson = isset($_GET['format']) && (string) $_GET['format'] === 'json';
$viewHtml = isset($_GET['view']) && (string) $_GET['view'] === 'html';
$looksLikeBrowser = (bool) preg_match('/\btext\/html\b/i', $accept);
$serveJson = $forceJson || (!$viewHtml && !$looksLikeBrowser);

header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=300');

if ($serveJson) {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Abfallio-Public-Index: 2');
    if ($cacheFile && is_readable($cacheFile)) {
        $raw = file_get_contents($cacheFile);
        $decoded = json_decode((string) $raw, true);
        $term = is_array($decoded) && isset($decoded['termine']) && is_array($decoded['termine']) ? $decoded['termine'] : null;
        if (is_array($term) && count($term) > 0) {
            echo $raw;
            exit;
        }
    }
    $admin = '/admin/plugins/' . rawurlencode($pluginFolder) . '/index.php';
    echo json_encode([
        'ok' => false,
        'code' => 'no_data',
        'error' => 'No data available',
        'message' => 'No collection data yet. In LoxBerry: Plugins → this plugin → Location → save, then Status & data → Fetch now.',
        'hint' => 'After a successful fetch, this URL (or ?format=json) returns the same JSON as the Loxone/cache file. For a help page in a browser, open the same path with ?view=html and optional ?lang= (e.g. de, fr).',
        'admin_url' => $admin,
        'plugin' => $pluginFolder,
        'timestamp' => date('Y-m-d\TH:i:sP'),
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// HTML (browser or explicit ?view=html): static templates only — avoids i18n/bootstrap on
// LoxBerry+PHP edge cases that produced HTTP 500 for the public help page.
$lang = 'en';
if (isset($_GET['lang']) && is_string($_GET['lang']) && preg_match('/^[a-z]{2}$/i', $_GET['lang'])) {
    $lang = strtolower($_GET['lang']);
}
$helpFile = __DIR__ . '/public_help_' . $lang . '.html';
if (!is_readable($helpFile)) {
    $helpFile = __DIR__ . '/public_help_en.html';
}
if (!is_readable($helpFile)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Missing public_help_*.html';
    exit;
}
$pf = rawurlencode($pluginFolder);
$html = (string) file_get_contents($helpFile);
$html = str_replace('{{PLUGIN_FOLDER}}', $pf, $html);
header('Content-Type: text/html; charset=utf-8');
echo $html;
