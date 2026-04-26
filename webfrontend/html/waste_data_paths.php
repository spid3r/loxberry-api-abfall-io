<?php
/**
 * Resolves the path to abfall_data.json — same logic for index.php and loxone.php.
 *
 * @return array{0: string, 1: list<array{label: string, path: string, exists: bool}>}
 */
function wasteapiio_find_abfall_data_json(): array
{
    $tried_paths = [];
    $candidates = [
        '__DIR__/abfall_data.json' => __DIR__ . '/abfall_data.json',
    ];

    $lbpdata = getenv('LBPDATA');
    if ($lbpdata) {
        $candidates['LBPDATA'] = $lbpdata . '/abfall_data.json';
    }

    $lbhomedir = getenv('LBHOMEDIR') ?: (is_dir('/opt/loxberry') ? '/opt/loxberry' : '');
    $lbpplugindir = getenv('LBPPLUGINDIR') ?: basename(__DIR__);

    if ($lbhomedir) {
        $candidates['LBHOMEDIR/data/plugins/' . $lbpplugindir] =
            $lbhomedir . '/data/plugins/' . $lbpplugindir . '/abfall_data.json';

        $pluginsDataDir = $lbhomedir . '/data/plugins';
        if (is_dir($pluginsDataDir)) {
            $dirs = @scandir($pluginsDataDir);
        if ($dirs) {
            foreach ($dirs as $d) {
                if ($d === '.' || $d === '..') {
                    continue;
                }
                $f = $pluginsDataDir . '/' . $d . '/abfall_data.json';
                if (file_exists($f)) {
                    $candidates['scan:' . $d] = $f;
                }
            }
        }
        }
    }

    $candidates['dirname(dirname(__DIR__))/data'] = dirname(dirname(__DIR__)) . '/data/abfall_data.json';

    $cache_file = '';
    foreach ($candidates as $label => $path) {
        $exists = file_exists($path);
        $tried_paths[] = ['label' => $label, 'path' => $path, 'exists' => $exists];
        if ($exists && !$cache_file) {
            $cache_file = $path;
        }
    }

    return [$cache_file, $tried_paths];
}
