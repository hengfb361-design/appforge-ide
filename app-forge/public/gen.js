/* AppForge generator: turns a few answers into a complete, buildable Android
   project plus the GitHub Actions workflow that produces a debug APK.
   Pure functions only (no DOM) so the same file runs in the browser and in
   Node for tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AppForge = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TEMPLATES = [
    { id: 'desc', label: 'សរសេរការពិពណ៌នា → App', desc: 'សរសេរជាភាសាខ្មែរ/English ហើយទទួលបាន App ដែលដំណើរការ', icon: '🪄' },
    { id: 'webview', label: 'វេបសាយ → App', desc: 'បើក URL របស់អ្នកក្នុង WebView ពេញអេក្រង់', icon: '🌐' },
    { id: 'blank', label: 'App ទទួលទទេ', desc: 'Kotlin + XML សម្រាប់ចាប់ផ្តើមសរសេរខ្លួនឯង', icon: '🧩' },
    { id: 'native', label: 'Native Android (Kotlin)', desc: 'Activity + XML layout ដែលរត់លើ Android ដោយផ្ទាល់', icon: '🤖' },
    { id: 'java', label: 'Native Android (Java)', desc: 'គម្រោង Java + XML សម្រាប់ Android', icon: '☕' },
    { id: 'ndk', label: 'C/C++ Android NDK', desc: 'JNI + CMake — កូដ C++ ក្លាយជា .so ក្នុង APK', icon: '⚙️' },
    { id: 'system', label: 'System App (Android)', desc: 'Overlay, Device Admin, boot service, shell/root — ជម្រៅប្រព័ន្ធ Android', icon: '🛡️' },
    { id: 'agent', label: 'AI Phone (Groq)', desc: 'Overlay បញ្ជាទូរស័ព្ទ: បើក app, អូសអេក្រង់, AI ប្តូរ model ពេល rate limit', icon: '🤖' },
    { id: 'notes', label: 'App កត់ត្រា', desc: 'សរសេរ/លុបកំណត់ត្រា រក្សាទុកក្នុងទូរស័ព្ទ', icon: '📝' }
  ];

  function slug(name) {
    const s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    return (s.slice(0, 24) || 'myapp');
  }

  function pascal(name) {
    const words = String(name || '').replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    let s = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    s = s.replace(/[^A-Za-z0-9]/g, '');
    if (!s || /^[0-9]/.test(s)) s = 'App' + s;
    return s.slice(0, 30) || 'MyApp';
  }

  function packageOf(name, custom) {
    const p = String(custom || '').trim().toLowerCase();
    if (/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(p)) return p;
    return 'com.example.' + slug(name);
  }

  function hexColor(value, fallback) {
    const v = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fallback;
  }

  function darker(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const f = Math.max(0, Math.min(1, factor));
    const r = Math.round(((n >> 16) & 255) * f);
    const g = Math.round(((n >> 8) & 255) * f);
    const b = Math.round((n & 255) * f);
    return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function normalize(cfg) {
    const c = cfg || {};
    const name = String(c.name || '').trim() || 'My App';
    const template = TEMPLATES.some((t) => t.id === c.template) ? c.template : 'desc';
    const color = hexColor(c.color, '#12B886');
    const url = String(c.url || '').trim();
    const toggles = c.toggles || {};
    const local = !!c.local;
    const perms = [];
    (Array.isArray(c.permissions) ? c.permissions : []).forEach((p) => {
      const pname = String(p || '').trim().toUpperCase().replace(/^ANDROID\.PERMISSION\./, '');
      if (/^[A-Z][A-Z0-9_]{1,40}$/.test(pname) && perms.indexOf(pname) < 0 && perms.length < 24) perms.push(pname);
    });
    return {
      name: name.slice(0, 40),
      pkg: packageOf(name, c.pkg),
      template: template,
      color: color,
      colorDark: darker(color, 0.72),
      url: local ? 'file:///android_asset/www/index.html'
                 : (/^https?:\/\/[^\s]+$/.test(url) ? url : 'https://example.com'),
      local: local,
      permissions: perms,
      orientation: ['portrait', 'landscape'].indexOf(c.orientation) >= 0 ? c.orientation : 'unspecified',
      icon: (c.icon && typeof c.icon === 'object') ? c.icon : null,
      target: ['debug', 'release', 'aab'].indexOf(c.target) >= 0 ? c.target : 'debug',
      versionName: (String(c.versionName || '1.0').trim() || '1.0').slice(0, 20),
      versionCode: Math.max(1, Math.min(2147483647, parseInt(c.versionCode, 10) || 1)),
      js: toggles.js !== false,
      back: toggles.back !== false,
      pull: !!toggles.pull,
      external: !!toggles.external,
      dark: toggles.dark !== false,
      description: String(c.description || '').slice(0, 4000)
    };
  }

  /* ---------------------------- Android sources ---------------------------- */

  function settingsGradle(c) {
    return [
      'pluginManagement {',
      '    repositories {',
      '        google()',
      '        mavenCentral()',
      '        gradlePluginPortal()',
      '    }',
      '}',
      'dependencyResolutionManagement {',
      '    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)',
      '    repositories {',
      '        google()',
      '        mavenCentral()',
      '    }',
      '}',
      'rootProject.name = "' + pascal(c.name) + '"',
      'include(":app")',
      ''
    ].join('\n');
  }

  function rootGradle() {
    return [
      'plugins {',
      '    id("com.android.application") version "8.5.2" apply false',
      '    id("org.jetbrains.kotlin.android") version "1.9.24" apply false',
      '}',
      ''
    ].join('\n');
  }

  function appGradle(c) {
    const isJava = c.template === 'java';
    const deps = [
      '    implementation("androidx.core:core-ktx:1.13.1")',
      '    implementation("androidx.appcompat:appcompat:1.7.0")',
      '    implementation("com.google.android.material:material:1.12.0")'
    ];
    if (c.template === 'webview' && c.pull) {
      deps.push('    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")');
    }
    // Only a release/aab build gets a signing config: pointing the debug build
    // at a keystore that does not exist yet would be a broken project.
    const signed = !!c.target && c.target !== 'debug';
    const signing = signed ? [
      '    signingConfigs {',
      '        create("appforge") {',
      '            storeFile = rootProject.file("appforge.jks")',
      '            storePassword = System.getenv("KEYSTORE_PASS") ?: ""',
      '            keyAlias = "appforge"',
      '            keyPassword = System.getenv("KEYSTORE_PASS") ?: ""',
      '        }',
      '    }',
      ''
    ] : [];
    const releaseSigning = signed
      ? ['            signingConfig = signingConfigs.getByName("appforge")'] : [];

    return [
      'plugins {',
      '    id("com.android.application")',
      ...(isJava ? [] : ['    id("org.jetbrains.kotlin.android")']),
      '}',
      '',
      'android {',
      ...signing,
      '    namespace = "' + c.pkg + '"',
      '    compileSdk = 34',
      '',
      '    defaultConfig {',
      '        applicationId = "' + c.pkg + '"',
      '        minSdk = 24',
      '        targetSdk = 34',
      '        versionCode = ' + c.versionCode,
      '        versionName = "' + c.versionName + '"',
      '    }',
      '',
      '    buildTypes {',
      '        release {',
      ...releaseSigning,
      '            isMinifyEnabled = false',
      '            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")',
      '        }',
      '    }',
      '',
      '    compileOptions {',
      '        sourceCompatibility = JavaVersion.VERSION_17',
      '        targetCompatibility = JavaVersion.VERSION_17',
      '    }',
      ...(isJava ? [] : [
        '    kotlinOptions {',
        '        jvmTarget = "17"',
        '    }'
      ]),
      ...(c.template === 'ndk' ? [
        '    ndkVersion = "26.1.10909125"',
        '    externalNativeBuild {',
        '        cmake {',
        '            path = file("src/main/cpp/CMakeLists.txt")',
        '            version = "3.22.1"',
        '        }',
        '    }',
        ''
      ] : []),
      '}',
      '',
      'dependencies {',
      deps.join('\n'),
      '}',
      ''
    ].join('\n');
  }

  function manifest(c, hasInternet) {
    const activityAttr = c.template === 'webview'
      ? ['            android:configChanges="orientation|screenSize|keyboardHidden"']
      : [];
    if (c.orientation && c.orientation !== 'unspecified') {
      activityAttr.push('            android:screenOrientation="' + c.orientation + '"');
    }
    const perms = (c.permissions || []).slice();
    if (hasInternet && perms.indexOf('INTERNET') < 0) perms.unshift('INTERNET');
    if (c.local && perms.indexOf('INTERNET') < 0) {
      // Bundled assets still need INTERNET when the page calls an API.
      perms.unshift('INTERNET');
    }
    // A system utility needs permissions that only show up in Settings, so the
    // scaffold declares them from the start and links the user to each toggle.
    if (c.template === 'system') {
      ['SYSTEM_ALERT_WINDOW', 'WRITE_SETTINGS', 'PACKAGE_USAGE_STATS',
        'KILL_BACKGROUND_PROCESSES', 'RECEIVE_BOOT_COMPLETED', 'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_SPECIAL_USE', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
        'QUERY_ALL_PACKAGES', 'WAKE_LOCK', 'POST_NOTIFICATIONS'].forEach((p) => {
        if (perms.indexOf(p) < 0) perms.push(p);
      });
    }
    // The AI assistant needs an overlay to be driven from anywhere, a service it
    // can keep alive, and the app list so a name like "tiktok" resolves.
    if (c.template === 'agent') {
      ['SYSTEM_ALERT_WINDOW', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_SPECIAL_USE',
        'POST_NOTIFICATIONS', 'QUERY_ALL_PACKAGES', 'RECEIVE_BOOT_COMPLETED',
        'WAKE_LOCK', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'CAMERA',
        'ACCESS_NOTIFICATION_POLICY', 'WRITE_SETTINGS', 'CHANGE_WIFI_STATE',
        'BLUETOOTH_ADMIN', 'MODIFY_AUDIO_SETTINGS', 'VIBRATE'].forEach((p) => {
        if (perms.indexOf(p) < 0) perms.push(p);
      });
    }
    const systemParts = c.template === 'system' ? [
      '        <receiver',
      '            android:name=".AdminReceiver"',
      '            android:permission="android.permission.BIND_DEVICE_ADMIN"',
      '            android:exported="true">',
      '            <meta-data',
      '                android:name="android.app.device_admin"',
      '                android:resource="@xml/device_admin" />',
      '            <intent-filter>',
      '                <action android:name="android.app.action.DEVICE_ADMIN_ENABLED" />',
      '            </intent-filter>',
      '        </receiver>',
      '        <receiver',
      '            android:name=".BootReceiver"',
      '            android:exported="true">',
      '            <intent-filter>',
      '                <action android:name="android.intent.action.BOOT_COMPLETED" />',
      '            </intent-filter>',
      '        </receiver>',
      '        <service',
      '            android:name=".OverlayService"',
      '            android:exported="false"',
      '            android:foregroundServiceType="specialUse">',
      '            <property',
      '                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"',
      '                android:value="system overlay utility" />',
      '        </service>'
    ].join('\n') : null;
    const agentParts = c.template === 'agent' ? [
      '        <service',
      '            android:name=".OverlayService"',
      '            android:exported="false"',
      '            android:foregroundServiceType="specialUse">',
      '            <property',
      '                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"',
      '                android:value="ai assistant overlay" />',
      '        </service>',
      '        <service',
      '            android:name=".AgentAccessibilityService"',
      '            android:exported="true"',
      '            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">',
      '            <intent-filter>',
      '                <action android:name="android.accessibilityservice.AccessibilityService" />',
      '            </intent-filter>',
      '            <meta-data',
      '                android:name="android.accessibilityservice"',
      '                android:resource="@xml/accessibility_config" />',
      '        </service>'
    ].join('\n') : null;
    const permLines = perms.map((p) =>
      '    <uses-permission android:name="android.permission.' + p + '" />');
    const appAttrs = [
      '        android:allowBackup="true"',
      '        android:icon="' + (c.icon && Object.keys(c.icon).length ? '@mipmap/ic_launcher' : '@drawable/ic_launcher') + '"',
      '        android:label="@string/app_name"',
      '        android:supportsRtl="true"',
      c.template === 'webview' ? '        android:usesCleartextTraffic="true"' : null,
      '        android:theme="@style/Theme.' + pascal(c.name) + '">'
    ].filter(Boolean);
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      permLines.join('\n'),
      '    <application',
      appAttrs.join('\n'),
      '        <activity',
      '            android:name=".MainActivity"',
      '            android:exported="true"',
      activityAttr.length ? activityAttr.join('\n') : null,
      '            >',
      '            <intent-filter>',
      '                <action android:name="android.intent.action.MAIN" />',
      '                <category android:name="android.intent.category.LAUNCHER" />',
      '            </intent-filter>',
      '        </activity>',
      systemParts,
      agentParts,
      '    </application>',
      '</manifest>',
      ''
    ].filter((line) => line !== null).join('\n');
  }

  function stringsXml(c) {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<resources>',
      '    <string name="app_name">' + escapeXml(c.name) + '</string>',
      '    <string name="accessibility_description">AI Phone បើក app និងអូសអេក្រង់តាមបញ្ជារបស់អ្នក។</string>',
      '</resources>',
      ''
    ].join('\n');
  }

  function colorsXml(c) {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<resources>',
      '    <color name="brand">' + c.color + '</color>',
      '    <color name="brand_dark">' + c.colorDark + '</color>',
      '    <color name="page">#0B0F14</color>',
      '    <color name="text">#EAF2FF</color>',
      '</resources>',
      ''
    ].join('\n');
  }

  function themesXml(c) {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<resources xmlns:tools="http://schemas.android.com/tools">',
      '    <style name="Theme.' + pascal(c.name) + '" parent="Theme.Material3.DayNight.NoActionBar">',
      '        <item name="colorPrimary">@color/brand</item>',
      '        <item name="colorSecondary">@color/brand</item>',
      '        <item name="android:statusBarColor">@color/brand_dark</item>',
      '        <item name="android:navigationBarColor">@color/page</item>',
      '    </style>',
      '</resources>',
      ''
    ].join('\n');
  }

  function themesNightXml(c) {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<resources>',
      '    <style name="Theme.' + pascal(c.name) + '" parent="Theme.Material3.DayNight.NoActionBar">',
      '        <item name="colorPrimary">@color/brand</item>',
      '        <item name="colorSecondary">@color/brand</item>',
      '        <item name="android:statusBarColor">@color/page</item>',
      '        <item name="android:navigationBarColor">@color/page</item>',
      '    </style>',
      '</resources>',
      ''
    ].join('\n');
  }

  function launcherXml(c) {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
      '    android:width="108dp"',
      '    android:height="108dp"',
      '    android:viewportWidth="108"',
      '    android:viewportHeight="108">',
      '    <path',
      '        android:fillColor="' + c.color + '"',
      '        android:pathData="M0,0h108v108h-108z" />',
      '    <path',
      '        android:fillColor="#FFFFFFFF"',
      '        android:pathData="M60,16L30,62h20l-4,30 32,-48h-21z" />',
      '</vector>',
      ''
    ].join('\n');
  }

  function escapeXml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
  }

  function mainActivityWebView(c) {
    const refresh = c.pull;
    // A bundled page served from file:// has no origin: ES modules, fetch() and
    // CORS all fail there, which leaves a page stuck on its own loading screen.
    // WebViewAssetLoader serves the same files over https with a real origin.
    const bundled = /^file:\/\/\/android_asset\/www\//.test(c.url);
    const startUrl = bundled
      ? 'https://appassets.androidplatform.net/assets/www/index.html'
      : c.url;
    const appHost = bundled ? 'appassets.androidplatform.net' : hostOf(c.url);
    const lines = [
      'package ' + c.pkg,
      '',
      'import android.annotation.SuppressLint',
      'import android.content.Intent',
      'import android.graphics.Color',
      'import android.net.Uri',
      'import android.os.Bundle',
      'import android.util.Log',
      'import android.webkit.ConsoleMessage',
      'import android.webkit.WebChromeClient',
      'import android.webkit.WebResourceError',
      'import android.webkit.WebResourceRequest',
      'import android.webkit.WebResourceResponse',
      'import android.webkit.WebView',
      'import android.webkit.WebViewClient',
      'import androidx.activity.OnBackPressedCallback',
      'import androidx.appcompat.app.AppCompatActivity',
      bundled ? 'import androidx.webkit.WebViewAssetLoader' : null,
      refresh ? 'import androidx.swiperefreshlayout.widget.SwipeRefreshLayout' : null,
      '',
      'class MainActivity : AppCompatActivity() {',
      '    private lateinit var web: WebView',
      bundled ? [
        '    private val assets: WebViewAssetLoader by lazy {',
        '        WebViewAssetLoader.Builder()',
        '            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))',
        '            .build()',
        '    }',
        ''
      ].join('\n') : null,
      refresh ? '    private lateinit var refreshLayout: SwipeRefreshLayout' : null,
      '',
      '    @SuppressLint("SetJavaScriptEnabled")',
      '    override fun onCreate(savedInstanceState: Bundle?) {',
      '        super.onCreate(savedInstanceState)',
      refresh
        ? '        setContentView(R.layout.activity_main)\n        refreshLayout = findViewById(R.id.refresh)\n        web = findViewById(R.id.web)'
        : '        web = WebView(this)\n        setContentView(web)',
      '        web.setBackgroundColor(Color.parseColor("#0B0F14"))',
      '        web.settings.javaScriptEnabled = ' + (c.js ? 'true' : 'false'),
      '        web.settings.domStorageEnabled = true',
      '        web.settings.loadWithOverviewMode = true',
      '        web.settings.useWideViewPort = true',
      '        web.webChromeClient = object : WebChromeClient() {',
      '            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {',
      '                Log.d("AppForgeWeb", msg.message() + " (" + msg.sourceId() + ":" + msg.lineNumber() + ")")',
      '                return true',
      '            }',
      '        }',
      '        web.webViewClient = object : WebViewClient() {',
      bundled ? [
        '            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {',
        '                return assets.shouldInterceptRequest(request.url)',
        '            }'
      ].join('\n') : null,
      '            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {',
      '                if (request.isForMainFrame) showLoadError(error.errorCode.toString() + " " + error.description, request.url.toString())',
      '            }',
      '',
      '            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {',
      '                if (request.isForMainFrame) showLoadError("HTTP " + response.statusCode, request.url.toString())',
      '            }',
      '',
      c.external ? [
        '            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {',
        '                val link = request.url',
        '                val host = link.host ?: ""',
        '                if (host.isNotEmpty() && (APP_HOST.isEmpty() || !host.endsWith(APP_HOST))) {',
        '                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link.toString())))',
        '                    return true',
        '                }',
        '                return false',
        '            }'
      ].join('\n') : [
        '            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {',
        '                return false',
        '            }'
      ].join('\n'),
      '        }',
      refresh ? [
        '        refreshLayout.setOnRefreshListener { web.reload() }',
        '        web.webChromeClient = object : WebChromeClient() {',
        '            override fun onProgressChanged(view: WebView, progress: Int) {',
        '                refreshLayout.isRefreshing = progress < 100',
        '            }',
        '            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {',
        '                Log.d("AppForgeWeb", msg.message() + " (" + msg.sourceId() + ":" + msg.lineNumber() + ")")',
        '                return true',
        '            }',
        '        }'
      ].join('\n') : null,
      '        web.loadUrl(START_URL)',
      '    }',
      '',
      '    /* A failed load used to leave the page on its own loading screen forever.',
      '       Show what went wrong instead of a blank WebView. */',
      '    private fun showLoadError(detail: String, url: String) {',
      '        Log.e("AppForge", "load failed: " + detail + " " + url)',
      '        val page = "<!doctype html><meta name=viewport content=\\"width=device-width,initial-scale=1\\">" +',
      '            "<body style=\\"background:#0B0F14;color:#E6EDF3;font-family:sans-serif;padding:24px;line-height:1.5\\">" +',
      '            "<h3 style=\\"margin:0 0 12px\\">ផ្ទុកមិនបាន</h3>" +',
      '            "<p style=\\"color:#FF7B72;margin:0 0 8px\\">" + detail.replace("<", "&lt;") + "</p>" +',
      '            "<p style=\\"color:#8B949E;font-size:13px;word-break:break-all\\">" + url + "</p>" +',
      '            "<p style=\\"color:#8B949E;font-size:13px\\">ពិនិត្យអ៊ីនធឺណិត ឬឯកសារ index.html ក្នុង assets/www</p></body>"',
      '        web.loadDataWithBaseURL(null, page, "text/html", "utf-8", null)',
      '    }',
      '',
      '    override fun onSaveInstanceState(outState: Bundle) {',
      '        super.onSaveInstanceState(outState)',
      '        web.saveState(outState)',
      '    }',
      c.back ? [
        '    override fun onBackPressed() {',
        '        if (web.canGoBack()) web.goBack() else finish()',
        '    }'
      ].join('\n') : null,
      '',
      '    companion object {',
      '        const val START_URL = "' + startUrl.replace(/"/g, '') + '"',
      '        const val APP_HOST = "' + appHost + '"',
      '    }',
      '}',
      ''
    ].filter((l) => l !== null);
    return lines.join('\n');
  }

  function hostOf(url) {
    const m = String(url).match(/^https?:\/\/([^/]+)/i);
    return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
  }

  function activityWebViewXml() {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<androidx.swiperefreshlayout.widget.SwipeRefreshLayout',
      '    xmlns:android="http://schemas.android.com/apk/res/android"',
      '    android:id="@+id/refresh"',
      '    android:layout_width="match_parent"',
      '    android:layout_height="match_parent">',
      '',
      '    <WebView',
      '        android:id="@+id/web"',
      '        android:layout_width="match_parent"',
      '        android:layout_height="match_parent" />',
      '',
      '</androidx.swiperefreshlayout.widget.SwipeRefreshLayout>',
      ''
    ].join('\n');
  }

  function mainActivityBlank(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.os.Bundle',
      'import android.widget.Button',
      'import android.widget.TextView',
      'import androidx.appcompat.app.AppCompatActivity',
      '',
      'class MainActivity : AppCompatActivity() {',
      '    private var taps = 0',
      '',
      '    override fun onCreate(savedInstanceState: Bundle?) {',
      '        super.onCreate(savedInstanceState)',
      '        setContentView(R.layout.activity_main)',
      '        val label = findViewById<TextView>(R.id.label)',
      '        findViewById<Button>(R.id.tap).setOnClickListener {',
      '            taps += 1',
      '            label.text = "អ្នកចុច " + taps + " ដង"',
      '        }',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function activityBlankXml(c) {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"',
      '    android:layout_width="match_parent"',
      '    android:layout_height="match_parent"',
      '    android:background="@color/page"',
      '    android:gravity="center"',
      '    android:orientation="vertical"',
      '    android:padding="24dp">',
      '',
      '    <TextView',
      '        android:layout_width="wrap_content"',
      '        android:layout_height="wrap_content"',
      '        android:text="@string/app_name"',
      '        android:textColor="@color/text"',
      '        android:textSize="28sp"',
      '        android:textStyle="bold" />',
      '',
      '    <TextView',
      '        android:id="@+id/label"',
      '        android:layout_width="wrap_content"',
      '        android:layout_height="wrap_content"',
      '        android:layout_marginTop="12dp"',
      '        android:text="អ្នកចុច 0 ដង"',
      '        android:textColor="@color/text"',
      '        android:textSize="18sp" />',
      '',
      '    <Button',
      '        android:id="@+id/tap"',
      '        android:layout_width="wrap_content"',
      '        android:layout_height="wrap_content"',
      '        android:layout_marginTop="24dp"',
      '        android:text="ចុច​ទីនេះ" />',
      '',
      '</LinearLayout>',
      ''
    ].join('\n');
  }

  function mainActivityNotes(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.os.Bundle',
      'import android.widget.ArrayAdapter',
      'import android.widget.Button',
      'import android.widget.EditText',
      'import android.widget.ListView',
      'import android.widget.Toast',
      'import androidx.appcompat.app.AppCompatActivity',
      '',
      'class MainActivity : AppCompatActivity() {',
      '    private val notes = mutableListOf<String>()',
      '    private lateinit var adapter: ArrayAdapter<String>',
      '',
      '    override fun onCreate(savedInstanceState: Bundle?) {',
      '        super.onCreate(savedInstanceState)',
      '        setContentView(R.layout.activity_main)',
      '',
      '        val input = findViewById<EditText>(R.id.input)',
      '        val list = findViewById<ListView>(R.id.list)',
      '        load()',
      '',
      '        adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, notes)',
      '        list.adapter = adapter',
      '',
      '        findViewById<Button>(R.id.add).setOnClickListener {',
      '            val text = input.text.toString().trim()',
      '            if (text.isEmpty()) return@setOnClickListener',
      '            notes.add(0, text)',
      '            input.setText("")',
      '            adapter.notifyDataSetChanged()',
      '            save()',
      '        }',
      '',
      '        list.setOnItemLongClickListener { _, _, position, _ ->',
      '            notes.removeAt(position)',
      '            adapter.notifyDataSetChanged()',
      '            save()',
      '            Toast.makeText(this, "លុបរួច", Toast.LENGTH_SHORT).show()',
      '            true',
      '        }',
      '    }',
      '',
      '    private fun save() {',
      '        getSharedPreferences("notes", MODE_PRIVATE)',
      '            .edit()',
      '            .putString("data", notes.joinToString(SEP))',
      '            .apply()',
      '    }',
      '',
      '    private fun load() {',
      '        val raw = getSharedPreferences("notes", MODE_PRIVATE).getString("data", "") ?: ""',
      '        if (raw.isNotEmpty()) notes.addAll(raw.split(SEP))',
      '    }',
      '',
      '    companion object {',
      '        private const val SEP = "\\u0001"',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function activityNotesXml() {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"',
      '    android:layout_width="match_parent"',
      '    android:layout_height="match_parent"',
      '    android:background="@color/page"',
      '    android:orientation="vertical"',
      '    android:padding="16dp">',
      '',
      '    <LinearLayout',
      '        android:layout_width="match_parent"',
      '        android:layout_height="wrap_content"',
      '        android:orientation="horizontal">',
      '',
      '        <EditText',
      '            android:id="@+id/input"',
      '            android:layout_width="0dp"',
      '            android:layout_height="wrap_content"',
      '            android:layout_weight="1"',
      '            android:hint="សរសេរកំណត់ត្រា…"',
      '            android:importantForAutofill="no"',
      '            android:textColor="@color/text"',
      '            android:textColorHint="#7A889B" />',
      '',
      '        <Button',
      '            android:id="@+id/add"',
      '            android:layout_width="wrap_content"',
      '            android:layout_height="wrap_content"',
      '            android:text="បន្ថែម" />',
      '',
      '    </LinearLayout>',
      '',
      '    <ListView',
      '        android:id="@+id/list"',
      '        android:layout_width="match_parent"',
      '        android:layout_height="0dp"',
      '        android:layout_marginTop="12dp"',
      '        android:layout_weight="1" />',
      '',
      '</LinearLayout>',
      ''
    ].join('\n');
  }

  /* ── native templates: Activity + XML layout, and a JNI bridge for NDK ── */

  function activityNativeXml() {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"',
      '    android:layout_width="match_parent"',
      '    android:layout_height="match_parent"',
      '    android:orientation="vertical"',
      '    android:gravity="center"',
      '    android:padding="24dp">',
      '',
      '    <TextView',
      '        android:id="@+id/label"',
      '        android:layout_width="wrap_content"',
      '        android:layout_height="wrap_content"',
      '        android:textSize="20sp"',
      '        android:text="សួស្តី" />',
      '',
      '    <Button',
      '        android:id="@+id/action"',
      '        android:layout_width="wrap_content"',
      '        android:layout_height="wrap_content"',
      '        android:layout_marginTop="16dp"',
      '        android:text="ចុចខ្ញុំ" />',
      '</LinearLayout>',
      ''
    ].join('\n');
  }

  function mainActivityNative(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.os.Bundle',
      'import android.widget.Button',
      'import android.widget.TextView',
      'import androidx.appcompat.app.AppCompatActivity',
      '',
      'class MainActivity : AppCompatActivity() {',
      '    private var taps = 0',
      '',
      '    override fun onCreate(savedInstanceState: Bundle?) {',
      '        super.onCreate(savedInstanceState)',
      '        setContentView(R.layout.activity_main)',
      '        val label = findViewById<TextView>(R.id.label)',
      '        findViewById<Button>(R.id.action).setOnClickListener {',
      '            taps++',
      '            label.text = "Taps: $taps"',
      '        }',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function mainActivityJava(c) {
    return [
      'package ' + c.pkg + ';',
      '',
      'import android.os.Bundle;',
      'import android.widget.Button;',
      'import android.widget.TextView;',
      'import androidx.appcompat.app.AppCompatActivity;',
      '',
      'public class MainActivity extends AppCompatActivity {',
      '    private int taps = 0;',
      '',
      '    @Override',
      '    protected void onCreate(Bundle savedInstanceState) {',
      '        super.onCreate(savedInstanceState);',
      '        setContentView(R.layout.activity_main);',
      '        final TextView label = findViewById(R.id.label);',
      '        Button action = findViewById(R.id.action);',
      '        action.setOnClickListener(v -> {',
      '            taps++;',
      '            label.setText("Taps: " + taps);',
      '        });',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function mainActivityNdk(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.os.Bundle',
      'import android.widget.TextView',
      'import androidx.appcompat.app.AppCompatActivity',
      '',
      'class MainActivity : AppCompatActivity() {',
      '    // Implemented in app/src/main/cpp/native-lib.cpp',
      '    private external fun stringFromJNI(): String',
      '',
      '    override fun onCreate(savedInstanceState: Bundle?) {',
      '        super.onCreate(savedInstanceState)',
      '        setContentView(R.layout.activity_main)',
      '        findViewById<TextView>(R.id.label).text = stringFromJNI()',
      '    }',
      '',
      '    companion object {',
      '        init { System.loadLibrary("native-lib") }',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function nativeLibCpp(c) {
    const fn = c.pkg.split('.').map((p) => p.replace(/[^A-Za-z0-9_]/g, '_')).join('_');
    return [
      '#include <jni.h>',
      '#include <string>',
      '',
      'extern "C" JNIEXPORT jstring JNICALL',
      'Java_' + fn + '_MainActivity_stringFromJNI(JNIEnv *env, jobject /* this */) {',
      '    std::string hello = "សួស្តីពី C++ (JNI) ដំណើរការ ✓";',
      '    return env->NewStringUTF(hello.c_str());',
      '}',
      ''
    ].join('\n');
  }

  function cmakeLists() {
    return [
      'cmake_minimum_required(VERSION 3.22.1)',
      'project("native-lib" CXX)',
      '',
      'add_library(native-lib SHARED native-lib.cpp)',
      'target_link_libraries(native-lib log)',
      ''
    ].join('\n');
  }

  /* ── system template: overlay, device admin, boot service, shell/root ──── */

  function activitySystemXml() {
    const button = (id, text) => [
      '        <Button',
      '            android:id="@+id/' + id + '"',
      '            android:layout_width="match_parent"',
      '            android:layout_height="wrap_content"',
      '            android:layout_marginTop="8dp"',
      '            android:text="' + text + '" />'
    ];
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<ScrollView xmlns:android="http://schemas.android.com/apk/res/android"',
      '    android:layout_width="match_parent"',
      '    android:layout_height="match_parent"',
      '    android:fillViewport="true">',
      '',
      '    <LinearLayout',
      '        android:layout_width="match_parent"',
      '        android:layout_height="wrap_content"',
      '        android:orientation="vertical"',
      '        android:padding="20dp">',
      '',
      '        <TextView',
      '            android:id="@+id/status"',
      '            android:layout_width="match_parent"',
      '            android:layout_height="wrap_content"',
      '            android:paddingBottom="12dp"',
      '            android:textSize="13sp"',
      '            android:text="checking" />',
      ''
    ].concat(
      button('btnOverlay', 'Off បើកសិទ្ធិ Overlay'),
      button('btnWriteSettings', 'សិទ្ធិសរសេរ Settings'),
      button('btnAdmin', 'ធ្វើជា Device Admin'),
      button('btnService', 'ចាប់ផ្ដើម Overlay Service'),
      button('btnShell', 'សាក Shell / Root')
    ).concat([
      '    </LinearLayout>',
      '</ScrollView>',
      ''
    ]).join('\n');
  }

  function mainActivitySystem(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.app.admin.DevicePolicyManager',
      'import android.content.ComponentName',
      'import android.content.Context',
      'import android.content.Intent',
      'import android.net.Uri',
      'import android.os.Bundle',
      'import android.provider.Settings',
      'import android.widget.Button',
      'import android.widget.TextView',
      'import androidx.appcompat.app.AppCompatActivity',
      'import androidx.core.content.ContextCompat',
      '',
      '/** Entry screen: every deep permission is requested explicitly and the',
      '    result stays visible in the status line. */',
      'class MainActivity : AppCompatActivity() {',
      '    private lateinit var status: TextView',
      '',
      '    override fun onCreate(savedInstanceState: Bundle?) {',
      '        super.onCreate(savedInstanceState)',
      '        setContentView(R.layout.activity_system)',
      '        status = findViewById(R.id.status)',
      '        findViewById<Button>(R.id.btnOverlay).setOnClickListener { askOverlay() }',
      '        findViewById<Button>(R.id.btnWriteSettings).setOnClickListener { askWriteSettings() }',
      '        findViewById<Button>(R.id.btnAdmin).setOnClickListener { askAdmin() }',
      '        findViewById<Button>(R.id.btnService).setOnClickListener { startOverlay() }',
      '        findViewById<Button>(R.id.btnShell).setOnClickListener { probeShell() }',
      '        show("root: " + SystemOps.isRooted() + " · overlay: " + canOverlay())',
      '    }',
      '',
      '    private fun canOverlay(): Boolean = Settings.canDrawOverlays(this)',
      '',
      '    private fun show(text: String) {',
      '        status.text = text',
      '    }',
      '',
      '    private fun askOverlay() {',
      '        if (canOverlay()) { show("overlay: មានសិទ្ធិរួចហើយ"); return }',
      '        val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,',
      '            Uri.parse("package:" + packageName))',
      '        startActivity(intent)',
      '    }',
      '',
      '    private fun askWriteSettings() {',
      '        val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS,',
      '            Uri.parse("package:" + packageName))',
      '        startActivity(intent)',
      '    }',
      '',
      '    private fun askAdmin() {',
      '        val admin = ComponentName(this, AdminReceiver::class.java)',
      '        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager',
      '        if (dpm.isAdminActive(admin)) { show("device admin: សកម្មរួចហើយ"); return }',
      '        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)',
      '        intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin)',
      '        intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "សម្រាប់មុខងារប្រព័ន្ធ")',
      '        startActivity(intent)',
      '    }',
      '',
      '    private fun startOverlay() {',
      '        ContextCompat.startForegroundService(this, Intent(this, OverlayService::class.java))',
      '        show("overlay service: កំពុងដំណើរការ")',
      '    }',
      '',
      '    private fun probeShell() {',
      '        val rooted = SystemOps.isRooted()',
      '        val out = if (rooted) SystemOps.runAsRoot("id") else SystemOps.shell("sh", "-c", "id")',
      '        val battery = SystemOps.batteryExempt(this)',
      '        show("root: " + rooted + " · id: " + out.output + " · battery exempt: " + battery)',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function systemOpsKt(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.app.ActivityManager',
      'import android.content.Context',
      'import android.os.PowerManager',
      'import android.provider.Settings',
      '',
      '/** Shell, root and settings helpers. Root commands only work on a rooted',
      '    phone or a platform-signed build; without them each call fails cleanly. */',
      'object SystemOps {',
      '    data class ShellResult(val ok: Boolean, val output: String)',
      '',
      '    fun shell(vararg command: String): ShellResult {',
      '        return try {',
      '            val process = ProcessBuilder(*command).redirectErrorStream(true).start()',
      '            val text = process.inputStream.bufferedReader().use { it.readText() }',
      '            val code = process.waitFor()',
      '            ShellResult(code == 0, text.trim())',
      '        } catch (e: Exception) {',
      '            ShellResult(false, e.message ?: "shell failed")',
      '        }',
      '    }',
      '',
      '    fun runAsRoot(command: String): ShellResult = shell("su", "-c", command)',
      '',
      '    fun isRooted(): Boolean {',
      '        val probe = runAsRoot("id")',
      '        return probe.ok && probe.output.contains("uid=0")',
      '    }',
      '',
      '    fun writeSetting(context: Context, key: String, value: String): ShellResult {',
      '        return try {',
      '            val ok = Settings.System.putString(context.contentResolver, key, value)',
      '            ShellResult(ok, key + " = " + value)',
      '        } catch (e: Exception) {',
      '            ShellResult(false, e.message ?: "WRITE_SETTINGS denied")',
      '        }',
      '    }',
      '',
      '    fun killBackground(context: Context, target: String): ShellResult {',
      '        return try {',
      '            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager',
      '            am.killBackgroundProcesses(target)',
      '            ShellResult(true, "killed " + target)',
      '        } catch (e: Exception) {',
      '            ShellResult(false, e.message ?: "kill failed")',
      '        }',
      '    }',
      '',
      '    fun batteryExempt(context: Context): Boolean {',
      '        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager',
      '        return pm.isIgnoringBatteryOptimizations(context.packageName)',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function overlayServiceKt(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.app.Notification',
      'import android.app.NotificationChannel',
      'import android.app.NotificationManager',
      'import android.app.Service',
      'import android.content.Intent',
      'import android.graphics.PixelFormat',
      'import android.os.IBinder',
      'import android.provider.Settings',
      'import android.view.Gravity',
      'import android.view.WindowManager',
      'import android.widget.TextView',
      'import androidx.core.app.NotificationCompat',
      '',
      '/** Foreground service that draws a floating overlay above other apps. */',
      'class OverlayService : Service() {',
      '    private var view: TextView? = null',
      '    private var manager: WindowManager? = null',
      '',
      '    override fun onBind(intent: Intent?): IBinder? = null',
      '',
      '    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {',
      '        startForeground(NOTIFICATION_ID, notification())',
      '        if (view == null) showOverlay()',
      '        return START_STICKY',
      '    }',
      '',
      '    private fun notification(): Notification {',
      '        val nm = getSystemService(NotificationManager::class.java)',
      '        nm.createNotificationChannel(',
      '            NotificationChannel(CHANNEL_ID, "System overlay", NotificationManager.IMPORTANCE_LOW)',
      '        )',
      '        return NotificationCompat.Builder(this, CHANNEL_ID)',
      '            .setContentTitle("AppForge system app")',
      '            .setContentText("Overlay service is running")',
      '            .setSmallIcon(android.R.drawable.ic_dialog_info)',
      '            .setOngoing(true)',
      '            .build()',
      '    }',
      '',
      '    private fun showOverlay() {',
      '        if (!Settings.canDrawOverlays(this)) return',
      '        val wm = getSystemService(WINDOW_SERVICE) as WindowManager',
      '        manager = wm',
      '        val label = TextView(this)',
      '        label.text = "AppForge overlay"',
      '        label.textSize = 14f',
      '        val params = WindowManager.LayoutParams(',
      '            WindowManager.LayoutParams.WRAP_CONTENT,',
      '            WindowManager.LayoutParams.WRAP_CONTENT,',
      '            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,',
      '            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,',
      '            PixelFormat.TRANSLUCENT',
      '        )',
      '        params.gravity = Gravity.TOP or Gravity.START',
      '        params.x = 24',
      '        params.y = 120',
      '        wm.addView(label, params)',
      '        view = label',
      '    }',
      '',
      '    override fun onDestroy() {',
      '        view?.let { manager?.removeView(it) }',
      '        view = null',
      '        super.onDestroy()',
      '    }',
      '',
      '    companion object {',
      '        const val CHANNEL_ID = "system_overlay"',
      '        const val NOTIFICATION_ID = 42',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function adminReceiverKt(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.app.admin.DeviceAdminReceiver',
      'import android.content.Context',
      'import android.content.Intent',
      'import android.widget.Toast',
      '',
      'class AdminReceiver : DeviceAdminReceiver() {',
      '    override fun onEnabled(context: Context, intent: Intent) {',
      '        Toast.makeText(context, "Device admin enabled", Toast.LENGTH_SHORT).show()',
      '    }',
      '',
      '    override fun onDisabled(context: Context, intent: Intent) {',
      '        Toast.makeText(context, "Device admin disabled", Toast.LENGTH_SHORT).show()',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function bootReceiverKt(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.content.BroadcastReceiver',
      'import android.content.Context',
      'import android.content.Intent',
      'import androidx.core.content.ContextCompat',
      '',
      'class BootReceiver : BroadcastReceiver() {',
      '    override fun onReceive(context: Context, intent: Intent) {',
      '        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {',
      '            ContextCompat.startForegroundService(context, Intent(context, OverlayService::class.java))',
      '        }',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function deviceAdminXml() {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<device-admin xmlns:android="http://schemas.android.com/apk/res/android">',
      '    <uses-policies>',
      '        <force-lock />',
      '    </uses-policies>',
      '</device-admin>',
      ''
    ].join('\n');
  }

  /* ── AI Phone: overlay command panel, accessibility gestures, Groq models ──
     The phone is driven the way its owner drives it: an accessibility service
     opens a package and swipes the screen. The model only turns a sentence into
     steps, and a rate-limited model is swapped for the next one. */

  /* The Groq client and the task runner live in agent.js: the browser loads it
     with a script tag, Node with require, and the generator asks for them here. */
  let AGENT_EXTRA = null;
  function agentExtra() {
    if (AGENT_EXTRA) return AGENT_EXTRA;
    const parts = {};
    const take = (value) => {
      if (value && typeof value === 'object') {
        Object.keys(value).forEach((key) => { parts[key] = value[key]; });
      }
    };
    try {
      if (typeof module === 'object' && module.exports && typeof require === 'function') {
        take(require('./agent.js'));
        try { take(require('./agentui.js')); } catch (e) { /* optional hands */ }
      } else if (typeof self !== 'undefined') {
        take(self.AppForgeAgent);
        take(self.AppForgeAgentUI);
      }
    } catch (e) {
      /* the built-in simpler overlay still generates an app that builds */
    }
    AGENT_EXTRA = parts;
    return AGENT_EXTRA;
  }

  function accessibilityConfigXml() {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"',
      '    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"',
      '    android:accessibilityFeedbackType="feedbackGeneric"',
      '    android:accessibilityFlags="flagDefault|flagRetrieveInteractiveWindows"',
      '    android:canPerformGestures="true"',
      '    android:canRetrieveWindowContent="true"',
      '    android:canTakeScreenshot="true"',
      '    android:description="@string/accessibility_description"',
      '    android:notificationTimeout="100" />',
      ''
    ].join('\n');
  }

  function activityAgentXml() {
    const button = (id, text) => [
      '        <Button',
      '            android:id="@+id/' + id + '"',
      '            android:layout_width="match_parent"',
      '            android:layout_height="wrap_content"',
      '            android:layout_marginTop="8dp"',
      '            android:text="' + text + '" />'
    ];
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<ScrollView xmlns:android="http://schemas.android.com/apk/res/android"',
      '    android:layout_width="match_parent"',
      '    android:layout_height="match_parent"',
      '    android:background="@color/page"',
      '    android:fillViewport="true">',
      '',
      '    <LinearLayout',
      '        android:layout_width="match_parent"',
      '        android:layout_height="wrap_content"',
      '        android:orientation="vertical"',
      '        android:padding="20dp">',
      '',
      '        <TextView',
      '            android:layout_width="wrap_content"',
      '            android:layout_height="wrap_content"',
      '            android:text="@string/app_name"',
      '            android:textColor="@color/text"',
      '            android:textSize="22sp"',
      '            android:textStyle="bold" />',
      '',
      '        <TextView',
      '            android:id="@+id/status"',
      '            android:layout_width="match_parent"',
      '            android:layout_height="wrap_content"',
      '            android:layout_marginTop="6dp"',
      '            android:paddingBottom="10dp"',
      '            android:text="checking"',
      '            android:textColor="#9FB3C8"',
      '            android:textSize="12sp" />',
      '',
      '        <EditText',
      '            android:id="@+id/groqKey"',
      '            android:layout_width="match_parent"',
      '            android:layout_height="wrap_content"',
      '            android:hint="Groq API key (gsk_...)"',
      '            android:importantForAutofill="no"',
      '            android:inputType="textVisiblePassword"',
      '            android:textColor="@color/text"',
      '            android:textColorHint="#7A889B" />',
      ''
    ].concat(
      button('btnSaveKey', 'រក្សាទុក Groq key'),
      button('btnOverlay', 'សិទ្ធិ Overlay'),
      button('btnAccess', 'បើក Accessibility'),
      button('btnStart', 'ចាប់ផ្ដើម AI overlay'),
      button('btnStop', 'បញ្ឈប់ overlay')
    ).concat([
      '',
      '        <TextView',
      '            android:layout_width="match_parent"',
      '            android:layout_height="wrap_content"',
      '            android:layout_marginTop="16dp"',
      '            android:text="បញ្ជា: បើក tiktok អូស 20 · OPEN:tiktok SCROLL:20"',
      '            android:textColor="#7A889B"',
      '            android:textSize="12sp" />',
      '',
      '    </LinearLayout>',
      '</ScrollView>',
      ''
    ]).join('\n');
  }

  function mainActivityAgent(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.content.Intent',
      'import android.net.Uri',
      'import android.os.Build',
      'import android.os.Bundle',
      'import android.provider.Settings',
      'import android.widget.Button',
      'import android.widget.EditText',
      'import android.widget.TextView',
      'import androidx.appcompat.app.AppCompatActivity',
      'import androidx.core.content.ContextCompat',
      '',
      '/** Setup screen: the key, the two system toggles, and the agent service. */',
      'class MainActivity : AppCompatActivity() {',
      '    private lateinit var status: TextView',
      '    private lateinit var keyField: EditText',
      '',
      '    override fun onCreate(savedInstanceState: Bundle?) {',
      '        super.onCreate(savedInstanceState)',
      '        setContentView(R.layout.activity_agent)',
      '        status = findViewById(R.id.status)',
      '        keyField = findViewById(R.id.groqKey)',
      '        keyField.setText(Prefs.key(this))',
      '',
      '        findViewById<Button>(R.id.btnSaveKey).setOnClickListener {',
      '            Prefs.setKey(this, keyField.text.toString().trim())',
      '            show("API key បានរក្សាទុក ✓")',
      '        }',
      '        findViewById<Button>(R.id.btnOverlay).setOnClickListener {',
      '            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + packageName)))',
      '        }',
      '        findViewById<Button>(R.id.btnAccess).setOnClickListener {',
      '            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))',
      '        }',
      '        findViewById<Button>(R.id.btnStart).setOnClickListener {',
      '            ContextCompat.startForegroundService(this, Intent(this, OverlayService::class.java))',
      '            show("AI overlay ដំណើរការ — ចុចប៊ូប AI")',
      '        }',
      '        findViewById<Button>(R.id.btnStop).setOnClickListener {',
      '            stopService(Intent(this, OverlayService::class.java))',
      '            show("បានបញ្ឈប់ overlay")',
      '        }',
      '        if (Build.VERSION.SDK_INT >= 33) {',
      '            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)',
      '        }',
      '    }',
      '',
      '    override fun onResume() {',
      '        super.onResume()',
      '        show(stateLine())',
      '    }',
      '',
      '    private fun stateLine(): String =',
      '        "overlay: " + Settings.canDrawOverlays(this) +',
      '            " · accessibility: " + (AgentAccessibilityService.instance != null) +',
      '            " · key: " + Prefs.key(this).isNotEmpty()',
      '',
      '    private fun show(text: String) {',
      '        status.text = text',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function workflowYaml(c) {
    const target = c.target || 'debug';
    const signed = target !== 'debug';
    const task = target === 'aab' ? 'bundleRelease'
      : (target === 'release' ? 'assembleRelease' : 'assembleDebug');
    const base = slug(c.name);
    const lines = [
      'name: Build Android',
      '',
      'on:',
      '  push:',
      '    branches: [ main, master ]',
      '  workflow_dispatch:',
      '',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 30',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '',
      '      - uses: actions/setup-java@v4',
      '        with:',
      '          distribution: temurin',
      '          java-version: "17"',
      '',
      // The cache step is a convenience: when Gradle's distribution host answers
      // 504 the action fails before any code is compiled, so a transient network
      // error looked like a broken project. It may fail without failing the job,
      // and the next step gets Gradle 8.7 onto PATH one way or another.
      '      - uses: gradle/actions/setup-gradle@v4',
      '        continue-on-error: true',
      '        with:',
      '          gradle-version: "8.7"',
      '',
      '      - name: Ensure Gradle 8.7',
      '        run: |',
      '          set -e',
      '          if command -v gradle >/dev/null 2>&1 && gradle --version 2>/dev/null | grep -q "Gradle 8\\."; then',
      '            echo "Gradle already available"',
      '            gradle --version | head -5',
      '            exit 0',
      '          fi',
      '          ok=0',
      '          for i in 1 2 3 4; do',
      '            if curl -fsSL --retry 4 --retry-delay 5 --retry-all-errors \\',
      '              -o "$RUNNER_TEMP/gradle.zip" \\',
      '              https://services.gradle.org/distributions/gradle-8.7-bin.zip; then ok=1; break; fi',
      '            echo "Gradle download failed (attempt $i), retrying in 10s"',
      '            sleep 10',
      '          done',
      '          if [ "$ok" != "1" ]; then',
      '            echo "::error::មិនអាចទាញ Gradle 8.7 បាន (បណ្តាញ services.gradle.org) — សូម Build ម្តងទៀត"',
      '            exit 1',
      '          fi',
      '          unzip -q -o "$RUNNER_TEMP/gradle.zip" -d "$RUNNER_TEMP"',
      '          echo "$RUNNER_TEMP/gradle-8.7/bin" >> "$GITHUB_PATH"',
      ''
    ];
    if (signed) {
      lines.push(
        '      - name: Create signing key',
        '        run: |',
        '          PASS="$(openssl rand -hex 12)"',
        '          echo "KEYSTORE_PASS=$PASS" >> "$GITHUB_ENV"',
        '          keytool -genkeypair -keystore appforge.jks -alias appforge \\',
        '            -keyalg RSA -keysize 2048 -validity 10000 \\',
        '            -storepass "$PASS" -keypass "$PASS" \\',
        '            -dname "CN=AppForge, O=AppForge, C=KH"',
        '',
        '      - name: Save signing key',
        '        run: |',
        '          echo "alias: appforge" > keystore-info.txt',
        '          echo "storePassword: $KEYSTORE_PASS" >> keystore-info.txt',
        '          echo "keyPassword: $KEYSTORE_PASS" >> keystore-info.txt',
        '          echo "file: appforge.jks" >> keystore-info.txt',
        '',
        '      - name: Upload signing key',
        '        uses: actions/upload-artifact@v4',
        '        with:',
        '          name: ' + base + '-keystore',
        '          path: |',
        '            appforge.jks',
        '            keystore-info.txt',
        '          if-no-files-found: error',
        ''
      );
    }
    lines.push(
      '      - name: Build ' + target.toUpperCase(),
      '        run: |',
      '          set -o pipefail',
      '          for i in 1 2 3; do',
      '            if gradle ' + task + ' --no-daemon --stacktrace 2>&1 | tee build.log; then exit 0; fi',
      '            if grep -qE "Could not (resolve|download|GET)|Unexpected HTTP response|Connection (reset|timed out)|Read timed out" build.log; then',
      '              echo "::warning::បញ្ហាបណ្តាញ — ព្យាយាមម្តងទៀត ($i)"',
      '              sleep 15',
      '            else',
      '              exit 1',
      '            fi',
      '          done',
      '          exit 1',
      '',
      '      - name: Upload APK',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: ' + base + '-apk',
      '          path: app/build/outputs/apk/*/*.apk',
      '          if-no-files-found: ' + (signed ? 'ignore' : 'error'),
      ''
    );
    if (target === 'aab') {
      lines.push(
        '      - name: Upload AAB',
        '        uses: actions/upload-artifact@v4',
        '        with:',
        '          name: ' + base + '-aab',
        '          path: app/build/outputs/bundle/release/*.aab',
        '          if-no-files-found: error',
        ''
      );
    }
    return lines.join('\n');
  }

  function readme(c) {
    const tpl = TEMPLATES.find((t) => t.id === c.template) || TEMPLATES[0];
    return [
      '# ' + c.name,
      '',
      'បង្កើតដោយ **AppForge** · ' + tpl.label + ' · `' + c.pkg + '`',
      '',
      '## របៀបបង្កើត APK (ឥតគិតថ្លៃ ~៣ នាទី)',
      '',
      '1. បង្កើត repo ថ្មីនៅ GitHub (Public ឬ Private ក៏បាន)។',
      '2. Upload ឯកសារទាំងអស់ក្នុង ZIP នេះទៅ root របស់ repo',
      '   (ត្រូវឃើញ `settings.gradle.kts` និងថត `.github/` នៅ root)។',
      '3. ចូល **Actions** → *Build APK* → រង់ចាំ ~២–៤ នាទី។',
      '4. ចុចលើ run ដែលជោគជ័យ → **Artifacts** → ទាញយក `' + slug(c.name) + '-apk.zip`។',
      '5. ពន្លាត → បានឯកសារ `app-debug.apk` → ដំឡើងលើទូរស័ព្ទ',
      '   (ត្រូវបើក "Install unknown apps" សម្រាប់ browser ដែលអ្នកប្រើ)។',
      '',
      '## បើ build មិនជោគជ័យ',
      '',
      '- Java/Gradle ខុស៖ workflow ប្រើ JDK 17 + Gradle 8.7 ស្រាប់ មិនត្រូវកែទេ។',
      '- បើអ្នកប្តូរ `compileSdk` ត្រូវប្តូរ `buildToolsVersion`/AGP ឱ្យត្រូវគ្នា។',
      '- Log កំហុសនៅ Actions → ចុច step ពណ៌ក្រហម។',
      '',
      '## ចំណាំ',
      '',
      '- APK នេះជា **debug** — ដំឡើងលើទូរស័ព្ទបាន តែដាក់លើ Play Store មិនបានទេ',
      '  (ត្រូវការ release keystore + AAB)។',
      '- បើ App ប្រើអ៊ីនធឺណិត ត្រូវមាន `<uses-permission android:name="android.permission.INTERNET" />`',
      '  ដែលបានដាក់ឱ្យរួចហើយ។',
      '- Package name: `' + c.pkg + '` · Version ' + c.versionName + ' (' + c.versionCode + ')',
      ''
    ].concat(c.template === 'system' ? [
      '## System app — អ្វីដែលដំណើរការ និងអ្វីដែលត្រូវការ root',
      '',
      '- **ដំណើរការធម្មតា (គ្មាន root):** Device Admin, Overlay (សុំសិទ្ធិក្នុង Settings),',
      '  Foreground service និងការចាប់ផ្ដើមពេលបើកទូរស័ព្ទ, ការសរសេរ Settings ដែលអនុញ្ញាត,',
      '  ការសម្អាត background processes និងការលើកលែង battery optimization។',
      '- **ត្រូវការ root៖** `SystemOps.runAsRoot(...)` និងពាក្យបញ្ជា `su -c`, ការដំឡើងជា',
      '  system app ក្នុង `/system/priv-app`, និង permission កម្រិត signature (platform key)។',
      '- App ធម្មតាដំឡើងជា user app មិនអាចទទួល permission កម្រិត signature បានទេ —',
      '  ត្រូវ sign ដោយ key របស់ ROM ឬដាក់ក្នុង `/system/priv-app` ដោយមាន root/custom ROM។',
      '- កូដទាំងអស់នៅក្នុង `app/src/main/java/...` — អ្នកអាចបន្ថែម file ថ្មីក្នុង IDE',
      '  ហើយ Gradle នឹង compile វាដោយស្វ័យប្រវត្តិ។',
      ''
    ] : []).join('\n');
  }

  function agentAccessibilityKt(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.accessibilityservice.AccessibilityService',
      'import android.accessibilityservice.GestureDescription',
      'import android.content.Intent',
      'import android.graphics.Path',
      'import android.graphics.Rect',
      'import android.os.Build',
      'import android.os.Bundle',
      'import android.view.accessibility.AccessibilityEvent',
      'import android.view.accessibility.AccessibilityNodeInfo',
      '',
      '/** The hands of the agent: launch a package, tap by text, type, swipe,',
      '    read the screen and the three global actions. */',
      'class AgentAccessibilityService : AccessibilityService() {',
      '    override fun onServiceConnected() {',
      '        super.onServiceConnected()',
      '        instance = this',
      '    }',
      '',
      '    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}',
      '',
      '    override fun onInterrupt() {}',
      '',
      '    override fun onDestroy() {',
      '        if (instance === this) instance = null',
      '        super.onDestroy()',
      '    }',
      '',
      '    fun screenSize(): Pair<Int, Int> {',
      '        val metrics = resources.displayMetrics',
      '        return Pair(metrics.widthPixels, metrics.heightPixels)',
      '    }',
      '',
      '    fun openApp(pkg: String): Boolean {',
      '        val intent = packageManager.getLaunchIntentForPackage(pkg) ?: return false',
      '        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)',
      '        startActivity(intent)',
      '        return true',
      '    }',
      '',
      '    fun swipeUp(): Boolean {',
      '        val metrics = resources.displayMetrics',
      '        val x = metrics.widthPixels / 2f',
      '        val path = Path().apply {',
      '            moveTo(x, metrics.heightPixels * 0.78f)',
      '            lineTo(x, metrics.heightPixels * 0.22f)',
      '        }',
      '        val gesture = GestureDescription.Builder()',
      '            .addStroke(GestureDescription.StrokeDescription(path, 0, 300))',
      '            .build()',
      '        return dispatchGesture(gesture, null, null)',
      '    }',
      '',
      '    fun back(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)',
      '',
      '    fun home(): Boolean = performGlobalAction(GLOBAL_ACTION_HOME)',
      '',
      '    companion object {',
      '        @Volatile',
      '        var instance: AgentAccessibilityService? = null',
      '            private set',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function overlayAgentKt(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.app.Notification',
      'import android.app.NotificationChannel',
      'import android.app.NotificationManager',
      'import android.app.Service',
      'import android.content.Intent',
      'import android.graphics.Color',
      'import android.graphics.PixelFormat',
      'import android.graphics.Typeface',
      'import android.os.Build',
      'import android.os.Handler',
      'import android.os.IBinder',
      'import android.os.Looper',
      'import android.provider.Settings',
      'import android.text.method.ScrollingMovementMethod',
      'import android.view.Gravity',
      'import android.view.WindowManager',
      'import android.view.inputmethod.EditorInfo',
      'import android.widget.Button',
      'import android.widget.EditText',
      'import android.widget.LinearLayout',
      'import android.widget.TextView',
      'import androidx.core.app.NotificationCompat',
      '',
      '/** Floating AI bubble that opens the command panel above every app. */',
      'class OverlayService : Service() {',
      '    private var manager: WindowManager? = null',
      '    private var bubble: TextView? = null',
      '    private var panel: LinearLayout? = null',
      '    private var logView: TextView? = null',
      '    private val ui = Handler(Looper.getMainLooper())',
      '    private val density: Float get() = resources.displayMetrics.density',
      '',
      '    override fun onBind(intent: Intent?): IBinder? = null',
      '',
      '    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {',
      '        startForeground(NOTIFICATION_ID, notification())',
      '        AgentLog.sink = { line -> append(line) }',
      '        if (bubble == null && panel == null) showBubble()',
      '        return START_STICKY',
      '    }',
      '',
      '    private fun notification(): Notification {',
      '        val nm = getSystemService(NotificationManager::class.java)',
      '        nm.createNotificationChannel(',
      '            NotificationChannel(CHANNEL_ID, "AI Phone", NotificationManager.IMPORTANCE_LOW)',
      '        )',
      '        return NotificationCompat.Builder(this, CHANNEL_ID)',
      '            .setContentTitle("AI Phone")',
      '            .setContentText("ចុចប៊ូប AI ដើម្បីបញ្ជា")',
      '            .setSmallIcon(android.R.drawable.ic_menu_compass)',
      '            .setOngoing(true)',
      '            .build()',
      '    }',
      '',
      '    private fun dp(value: Int): Int = (value * density).toInt()',
      '',
      '    @Suppress("DEPRECATION")',
      '    private fun overlayType(): Int =',
      '        if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY',
      '        else WindowManager.LayoutParams.TYPE_PHONE',
      '',
      '    private fun params(focusable: Boolean): WindowManager.LayoutParams {',
      '        val p = WindowManager.LayoutParams(',
      '            WindowManager.LayoutParams.WRAP_CONTENT,',
      '            WindowManager.LayoutParams.WRAP_CONTENT,',
      '            overlayType(),',
      '            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,',
      '            PixelFormat.TRANSLUCENT',
      '        )',
      '        if (!focusable) p.flags = p.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE',
      '        p.gravity = Gravity.TOP or Gravity.START',
      '        p.x = dp(8)',
      '        p.y = dp(96)',
      '        p.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE',
      '        return p',
      '    }',
      '',
      '    private fun showBubble() {',
      '        if (!Settings.canDrawOverlays(this)) {',
      '            stopSelf()',
      '            return',
      '        }',
      '        val wm = getSystemService(WINDOW_SERVICE) as WindowManager',
      '        manager = wm',
      '        val view = TextView(this).apply {',
      '            text = "AI"',
      '            textSize = 15f',
      '            typeface = Typeface.DEFAULT_BOLD',
      '            gravity = Gravity.CENTER',
      '            setTextColor(Color.parseColor("#08131F"))',
      '            setBackgroundColor(Color.parseColor("#FFC24B"))',
      '            setPadding(dp(12), dp(12), dp(12), dp(12))',
      '            setOnClickListener { openPanel() }',
      '        }',
      '        wm.addView(view, params(false))',
      '        bubble = view',
      '    }',
      '',
      '    private fun openPanel() {',
      '        val wm = manager ?: return',
      '        bubble?.let { view -> runCatching { wm.removeView(view) } }',
      '        bubble = null',
      '',
      '        val root = LinearLayout(this).apply {',
      '            orientation = LinearLayout.VERTICAL',
      '            setBackgroundColor(Color.parseColor("#F2081118"))',
      '            setPadding(dp(12), dp(10), dp(12), dp(10))',
      '        }',
      '        root.layoutParams = LinearLayout.LayoutParams(dp(310), LinearLayout.LayoutParams.WRAP_CONTENT)',
      '',
      '        val header = LinearLayout(this).apply {',
      '            orientation = LinearLayout.HORIZONTAL',
      '            gravity = Gravity.CENTER_VERTICAL',
      '        }',
      '        val title = TextView(this).apply {',
      '            text = "AI Phone"',
      '            textSize = 16f',
      '            typeface = Typeface.DEFAULT_BOLD',
      '            setTextColor(Color.parseColor("#FFD37A"))',
      '        }',
      '        header.addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))',
      '        val close = TextView(this).apply {',
      '            text = "✕"',
      '            textSize = 15f',
      '            setTextColor(Color.parseColor("#E6EDF3"))',
      '            setPadding(dp(10), 0, dp(2), 0)',
      '            setOnClickListener { closePanel() }',
      '        }',
      '        header.addView(close)',
      '        root.addView(header)',
      '',
      '        val log = TextView(this).apply {',
      '            textSize = 12f',
      '            setTextColor(Color.parseColor("#CDE7FF"))',
      '            maxLines = 12',
      '            movementMethod = ScrollingMovementMethod()',
      '            setPadding(0, dp(6), 0, dp(6))',
      '        }',
      '        root.addView(log, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(190)))',
      '',
      '        val row = LinearLayout(this).apply {',
      '            orientation = LinearLayout.HORIZONTAL',
      '            gravity = Gravity.CENTER_VERTICAL',
      '        }',
      '        val input = EditText(this).apply {',
      '            hint = "បញ្ជា: បើក tiktok អូស 20"',
      '            textSize = 13f',
      '            isSingleLine = true',
      '            imeOptions = EditorInfo.IME_ACTION_SEND',
      '            setTextColor(Color.parseColor("#E6EDF3"))',
      '            setHintTextColor(Color.parseColor("#7A889B"))',
      '        }',
      '        row.addView(input, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))',
      '        val send = Button(this).apply { text = "➤" }',
      '        row.addView(send)',
      '        root.addView(row)',
      '',
      '        wm.addView(root, params(true))',
      '        panel = root',
      '        logView = log',
      '',
      '        send.setOnClickListener {',
      '            val command = input.text.toString().trim()',
      '            if (command.isEmpty()) return@setOnClickListener',
      '            input.setText("")',
      '            append("អ្នក: " + command)',
      '            AgentRunner.run(this, command) { line -> append(line) }',
      '        }',
      '    }',
      '',
      '    private fun closePanel() {',
      '        panel?.let { view -> manager?.let { runCatching { it.removeView(view) } } }',
      '        panel = null',
      '        logView = null',
      '        showBubble()',
      '    }',
      '',
      '    private fun append(line: String) {',
      '        ui.post {',
      '            val view = logView ?: return@post',
      '            view.append(if (view.text.isEmpty()) line else "\\n" + line)',
      '        }',
      '    }',
      '',
      '    override fun onDestroy() {',
      '        AgentLog.sink = null',
      '        bubble?.let { view -> manager?.let { runCatching { it.removeView(view) } } }',
      '        panel?.let { view -> manager?.let { runCatching { it.removeView(view) } } }',
      '        bubble = null',
      '        panel = null',
      '        super.onDestroy()',
      '    }',
      '',
      '    companion object {',
      '        private const val CHANNEL_ID = "ai_phone"',
      '        private const val NOTIFICATION_ID = 77',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function gitignore() {
    return [
      '*.iml',
      '.gradle/',
      '/local.properties',
      '.idea/',
      'build/',
      'captures/',
      '.externalNativeBuild/',
      ''
    ].join('\n');
  }

  /* ------------------------------- assembly ------------------------------- */

  function build(cfg) {
    const c = normalize(cfg);
    if (c.template === 'desc') return buildDescProject(c);
    const files = [];
    const add = (path, text) => files.push({ path: path, text: text });
    const hasInternet = c.template === 'webview' || c.template === 'agent';

    add('settings.gradle.kts', settingsGradle(c));
    add('build.gradle.kts', rootGradle());
    add('gradle.properties', [
      'org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8',
      'android.useAndroidX=true',
      'kotlin.code.style=official',
      'android.nonTransitiveRClass=true',
      ''
    ].join('\n'));
    add('app/build.gradle.kts', appGradle(c));
    add('app/proguard-rules.pro', '# Keep rules go here.\n');
    add('app/src/main/AndroidManifest.xml', manifest(c, hasInternet));
    add('app/src/main/res/values/strings.xml', stringsXml(c));
    add('app/src/main/res/values/colors.xml', colorsXml(c));
    add('app/src/main/res/values/themes.xml', themesXml(c));
    if (c.dark) add('app/src/main/res/values-night/themes.xml', themesNightXml(c));
    add('app/src/main/res/drawable/ic_launcher.xml', launcherXml(c));

    const srcDir = 'app/src/main/java/' + c.pkg.split('.').join('/');
    if (c.template === 'webview') {
      add(srcDir + '/MainActivity.kt', mainActivityWebView(c));
      if (c.pull) add('app/src/main/res/layout/activity_main.xml', activityWebViewXml());
    } else if (c.template === 'notes') {
      add(srcDir + '/MainActivity.kt', mainActivityNotes(c));
      add('app/src/main/res/layout/activity_main.xml', activityNotesXml());
    } else if (c.template === 'native') {
      add(srcDir + '/MainActivity.kt', mainActivityNative(c));
      add('app/src/main/res/layout/activity_main.xml', activityNativeXml());
    } else if (c.template === 'java') {
      add(srcDir + '/MainActivity.java', mainActivityJava(c));
      add('app/src/main/res/layout/activity_main.xml', activityNativeXml());
    } else if (c.template === 'ndk') {
      add(srcDir + '/MainActivity.kt', mainActivityNdk(c));
      add('app/src/main/res/layout/activity_main.xml', activityNativeXml());
      add('app/src/main/cpp/CMakeLists.txt', cmakeLists());
      add('app/src/main/cpp/native-lib.cpp', nativeLibCpp(c));
    } else if (c.template === 'system') {
      add(srcDir + '/MainActivity.kt', mainActivitySystem(c));
      add(srcDir + '/SystemOps.kt', systemOpsKt(c));
      add(srcDir + '/OverlayService.kt', overlayServiceKt(c));
      add(srcDir + '/AdminReceiver.kt', adminReceiverKt(c));
      add(srcDir + '/BootReceiver.kt', bootReceiverKt(c));
      add('app/src/main/res/layout/activity_system.xml', activitySystemXml());
      add('app/src/main/res/xml/device_admin.xml', deviceAdminXml());
    } else if (c.template === 'agent') {
      const extra = agentExtra();
      add(srcDir + '/MainActivity.kt', mainActivityAgent(c));
      add(srcDir + '/OverlayService.kt', (extra.overlayKt || overlayAgentKt)(c));
      add(srcDir + '/AgentAccessibilityService.kt', (extra.agentAccessibilityKt || agentAccessibilityKt)(c));
      if (typeof extra.groqClientKt === 'function') add(srcDir + '/GroqClient.kt', extra.groqClientKt(c));
      if (typeof extra.agentRunnerKt === 'function') add(srcDir + '/AgentRunner.kt', extra.agentRunnerKt(c));
      add('app/src/main/res/layout/activity_agent.xml', activityAgentXml());
      add('app/src/main/res/xml/accessibility_config.xml', accessibilityConfigXml());
    } else {
      add(srcDir + '/MainActivity.kt', mainActivityBlank(c));
      add('app/src/main/res/layout/activity_main.xml', activityBlankXml(c));
    }

    add('.github/workflows/build-apk.yml', workflowYaml(c));
    add('README.md', readme(c));
    add('.gitignore', gitignore());

    return { config: c, files: files };
  }

  /* --------------------- IDE project → Android project --------------------- */
  /* Web files become WebView assets. A file whose path already looks like
     part of a Gradle project (app/src/main/..., build.gradle, .github/...)
     replaces the generated one, so a Java or Kotlin file is compiled by
     Gradle — nothing is renamed into place. */
  // Everything under app/src/main is a real Gradle input — including
  // AndroidManifest.xml. Missing that one shipped a WebView manifest with none
  // of the project's permissions, services or receivers.
  const NATIVE_PATH = /^(?:app\/(?:src\/main\/|build\.gradle|proguard-rules\.pro)|build\.gradle|settings\.gradle|gradle\.properties|\.github\/)/;

  /* A native project's own sources decide its package: the panel field is only a
     default, and a namespace that disagrees with the real classes leaves the
     manifest pointing at an activity that does not exist. */
  function nativePackage(projectFiles) {
    const list = Array.isArray(projectFiles) ? projectFiles : [];
    const sources = [];
    let manifest = '';
    list.forEach((f) => {
      const path = String((f && f.path) || '').replace(/^\.?\/+/, '');
      if (path === 'app/src/main/AndroidManifest.xml') {
        if (typeof f.text === 'string') manifest = f.text;
        return;
      }
      if (!/^app\/src\/main\/(java|kotlin)\/.+\.(kt|java)$/.test(path)) return;
      const m = String(typeof f.text === 'string' ? f.text : '').match(/^\s*package\s+([A-Za-z_][\w.]*)/m);
      if (m) sources.push({ pkg: m[1], path: path });
    });
    if (!sources.length) return '';
    const refs = (manifest.match(/android:name="\.?([A-Za-z_][\w.]*)"/g) || [])
      .map((s) => s.replace(/^android:name="\.?/, '').replace(/"$/, ''));
    const score = {};
    sources.forEach((s) => {
      const base = s.path.split('/').pop().replace(/\.(kt|java)$/, '');
      const fq = s.path.replace(/^app\/src\/main\/(java|kotlin)\//, '').replace(/\.(kt|java)$/, '').split('/').join('.');
      score[s.pkg] = score[s.pkg] || { files: 0, refs: 0 };
      score[s.pkg].files += 1;
      if (refs.some((r) => r === fq || r === s.pkg + '.' + base || r === base)) score[s.pkg].refs += 1;
    });
    const names = Object.keys(score).sort((a, b) =>
      (score[b].refs - score[a].refs) || (score[b].files - score[a].files) || (a < b ? -1 : 1));
    if (names.length > 1 && score[names[0]].refs === score[names[1]].refs &&
      score[names[0]].files === score[names[1]].files) return '';
    return names[0];
  }

  /* Coordinates for the libraries that source imports and themes actually need,
     so a project script with no dependency block is not built empty. */
  const LIB_BY_GROUP = {
    appcompat: 'androidx.appcompat:appcompat:1.7.0',
    core: 'androidx.core:core-ktx:1.13.1',
    activity: 'androidx.activity:activity-ktx:1.9.3',
    fragment: 'androidx.fragment:fragment-ktx:1.8.2',
    recyclerview: 'androidx.recyclerview:recyclerview:1.3.2',
    constraintlayout: 'androidx.constraintlayout:constraintlayout:2.1.4',
    viewpager2: 'androidx.viewpager2:viewpager2:1.1.0',
    swiperefreshlayout: 'androidx.swiperefreshlayout:swiperefreshlayout:1.1.0',
    webkit: 'androidx.webkit:webkit:1.11.0',
    lifecycle: 'androidx.lifecycle:lifecycle-runtime-ktx:2.8.4'
  };

  function requiredLibs(files) {
    const text = files.filter((f) => typeof f.text === 'string' && /\.(kt|java|xml)$/.test(f.path))
      .map((f) => f.text).join('\n');
    const libs = [];
    Object.keys(LIB_BY_GROUP).forEach((group) => {
      if (new RegExp('import\\s+androidx\\.' + group + '\\.').test(text)) libs.push(LIB_BY_GROUP[group]);
    });
    if (/parent="Theme\.Material(3|Components)\./.test(text)) libs.push('com.google.android.material:material:1.12.0');
    return libs;
  }

  function buildProject(cfg, projectFiles) {
    const c = cfg || {};
    const detected = nativePackage(projectFiles);
    if (detected) c.pkg = detected;
    const online = !!c.online && /^https?:\/\/[^\s]+$/i.test(String(c.url || '').trim());
    const config = normalize(Object.assign({}, c, {
      template: 'webview', local: !online,
      url: online ? String(c.url).trim() : ''
    }));
    const base = build(config);
    let files = base.files.slice();
    const index = {};
    files.forEach((f, i) => { index[f.path] = i; });
    const put = (entry) => {
      if (Object.prototype.hasOwnProperty.call(index, entry.path)) {
        files[index[entry.path]] = entry;
      } else {
        index[entry.path] = files.length;
        files.push(entry);
      }
    };
    const icons = config.icon && typeof config.icon === 'object' ? config.icon : null;
    if (icons && Object.keys(icons).length) {
      const at = index['app/src/main/res/drawable/ic_launcher.xml'];
      if (typeof at === 'number') files.splice(at, 1);
      Object.keys(icons).forEach((density) => {
        if (!/^mipmap-(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$/.test(density)) return;
        const raw = String(icons[density] || '').split(',').pop();
        if (!raw) return;
        put({ path: 'app/src/main/res/' + density + '/ic_launcher.png', b64: raw });
      });
    }
    let web = 0;
    let native = 0;
    (Array.isArray(projectFiles) ? projectFiles : []).forEach((f) => {
      const path = String((f && f.path) || '').replace(/^\.?\/+/, '');
      if (!path) return;
      const entry = {};
      if (typeof f.text === 'string') entry.text = f.text;
      else if (typeof f.b64 === 'string') entry.b64 = f.b64;
      else return;
      if (NATIVE_PATH.test(path)) {
        put(Object.assign({ path: path }, entry));
        native += 1;
      } else {
        put(Object.assign({ path: 'app/src/main/assets/www/' + path }, entry));
        web += 1;
      }
    });
    // Gradle silently prefers the Groovy script when both flavours exist, so a
    // project that ships build.gradle would drop the generated .kts — including
    // its dependency list — and compile against an empty build. Keep one.
    const generated = ['build.gradle.kts', 'settings.gradle.kts', 'app/build.gradle.kts'];
    const groovyTwin = { 'build.gradle.kts': 'build.gradle', 'settings.gradle.kts': 'settings.gradle', 'app/build.gradle.kts': 'app/build.gradle' };
    const drop = {};
    generated.forEach((ktsPath) => {
      if (Object.prototype.hasOwnProperty.call(index, groovyTwin[ktsPath])) drop[ktsPath] = 1;
    });
    if (Object.keys(drop).length) files = files.filter((f) => !drop[f.path]);
    // Generated infrastructure is not user code: a project created before a fix
    // would otherwise keep its old workflow and its old WebView activity for
    // good, and neither repair would ever reach the APK it builds. Only files
    // that still match the generator's own text are replaced.
    const wfPath = '.github/workflows/build-apk.yml';
    const wfAt = files.findIndex((f) => f.path === wfPath);
    if (wfAt >= 0 && typeof files[wfAt].text === 'string' &&
      /name:\s*Build Android/.test(files[wfAt].text) &&
      /gradle\/actions\/setup-gradle/.test(files[wfAt].text)) {
      files[wfAt] = { path: wfPath, text: workflowYaml(config) };
    }
    const activityPath = 'app/src/main/java/' + config.pkg.split('.').join('/') + '/MainActivity.kt';
    const actAt = files.findIndex((f) => f.path === activityPath);
    if (actAt >= 0 && typeof files[actAt].text === 'string') {
      const old = files[actAt].text;
      const generatedWebView = old.indexOf('const val START_URL = "file:///android_asset/www/index.html"') >= 0 &&
        old.indexOf('web.settings.domStorageEnabled = true') >= 0 &&
        old.indexOf('WebViewAssetLoader') < 0;
      if (generatedWebView) files[actAt] = { path: activityPath, text: mainActivityWebView(config) };
    }
    /* The manifest launches `.MainActivity`, so the class the project wrote is the
       app even when it sits in another package folder. Keeping the generator's
       WebView twin next to it declares the same class twice and kotlinc stops. */
    const ownActivity = files.some((f) => /\/MainActivity\.(kt|java)$/.test(f.path) &&
      f.path !== activityPath && typeof f.text === 'string' &&
      /class MainActivity/.test(f.text) && f.text.indexOf('appassets.androidplatform.net') < 0);
    if (ownActivity) {
      const stub = files.findIndex((f) => f.path === activityPath && typeof f.text === 'string' &&
        f.text.indexOf('appassets.androidplatform.net') >= 0);
      if (stub >= 0) files.splice(stub, 1);
    }
    const ownManifest = (Array.isArray(projectFiles) ? projectFiles : []).some((f) =>
      String((f && f.path) || '').replace(/^\.?\/+/, '') === 'app/src/main/AndroidManifest.xml');
    // A project script with no dependency block of its own would compile against
    // nothing, so supply the libraries its imports and theme require.
    const appScript = files.filter((f) => f.path === 'app/build.gradle' || f.path === 'app/build.gradle.kts')[0];
    let injected = 0;
    if (appScript && typeof appScript.text === 'string' && !/^\s*dependencies\s*[{(]/m.test(appScript.text)) {
      const libs = requiredLibs(files);
      if (libs.length) {
        appScript.text = appScript.text.replace(/\s*$/, '\n') + '\ndependencies {\n' +
          libs.map((l) => '    implementation("' + l + '")').join('\n') + '\n}\n';
        injected = libs.length;
      }
    } else if (appScript && typeof appScript.text === 'string') {
      // A script that already has a dependency block still has to gain the
      // libraries the sources were given, or the build fails on a missing import.
      const t = appScript.text;
      const missing = requiredLibs(files).filter((l) => {
        const ga = l.split(':').slice(0, 2).join(':');
        return t.indexOf(ga) < 0;
      });
      if (missing.length) {
        const at = t.search(/^\s*dependencies\s*[{(]/m);
        const open = t.indexOf('{', at);
        if (open > 0) {
          appScript.text = t.slice(0, open + 1) + '\n' +
            missing.map((l) => '    implementation("' + l + '")').join('\n') +
            t.slice(open + 1);
          injected = missing.length;
        }
      }
    }
    // A project script that never pins a JVM target leaves javac at 1.8 while
    // Kotlin follows the JDK (17); Gradle refuses to compile those together.
    if (appScript && typeof appScript.text === 'string' && files.some((f) => /\.kt$/.test(f.path))) {
      const t = appScript.text;
      const noOptions = !/compileOptions\s*\{/.test(t);
      const noJvm = !/jvmTarget/.test(t);
      if (noOptions || noJvm) {
        const block = ['', 'android {'];
        if (noOptions) {
          block.push('    compileOptions {', '        sourceCompatibility = JavaVersion.VERSION_17',
            '        targetCompatibility = JavaVersion.VERSION_17', '    }');
        }
        if (noJvm) block.push('    kotlinOptions {', '        jvmTarget = "17"', '    }');
        block.push('}');
        appScript.text = t.replace(/\s*$/, '\n') + block.join('\n') + '\n';
      }
    }
    if (injected) {
      const props = files.filter((f) => f.path === 'gradle.properties')[0];
      if (props && typeof props.text === 'string' && !/android\.useAndroidX\s*=\s*true/.test(props.text)) {
        props.text = props.text.replace(/\s*$/, '\n') + 'android.useAndroidX=true\n';
      }
    }
    return { config: config, files: files, web: web, native: native, local: config.local,
      ownManifest: ownManifest, injected: injected };
  }

  /* -------------------------------- ZIP I/O -------------------------------- */

  let CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    CRC_TABLE = table;
    return table;
  }

  function crc32(bytes) {
    const table = crcTable();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function concat(chunks) {
    let total = 0;
    for (const ch of chunks) total += ch.length;
    const out = new Uint8Array(total);
    let at = 0;
    for (const ch of chunks) {
      out.set(ch, at);
      at += ch.length;
    }
    return out;
  }

  const DOS_TIME = (12 << 11) | (0 << 5) | 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 3;

  function fromBase64(b64) {
    const raw = atob(String(b64 || ''));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function zip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const file of files) {
      const nameBytes = enc.encode(file.path);
      const data = typeof file.text === 'string' ? enc.encode(file.text)
        : (typeof file.b64 === 'string' ? fromBase64(file.b64) : file.data);
      const sum = crc32(data);

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, DOS_TIME, true);
      lv.setUint16(12, DOS_DATE, true);
      lv.setUint32(14, sum, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      parts.push(local, data);

      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, DOS_TIME, true);
      cv.setUint16(14, DOS_DATE, true);
      cv.setUint32(16, sum, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += local.length + data.length;
    }

    const centralBytes = concat(central);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralBytes.length, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);
    return concat(parts.concat([centralBytes, eocd]));
  }

  /* --------------------- description → working Kotlin app ------------------- */
  /* The description is compiled into a small, fixed app engine plus a data
     file (AppSpec.kt). Only the data changes per description, so every
     generated project stays compilable. */
  function descScreens(text) {
    const raw = String(text || '');
    const t = raw.toLowerCase();
    const screens = [{ type: 'home', title: 'ផ្ទះ', payload: '' }];
    const found = [];
    const url = raw.match(/https?:\/\/[^\s,)\]]+/i);
    if (url) {
      screens.push({ type: 'web', title: 'វេបសាយ', payload: url[0] });
      found.push('វេបសាយ');
    }
    if (/បញ្ជី|រាយ|ទំនិញ|ស្តុក|ការងារ|កត់ត្រា|todo|list|item|shop|stock|task|note|inventory/.test(t)) {
      screens.push({ type: 'list', title: 'បញ្ជី', payload: 'main' });
      found.push('បញ្ជី');
    }
    if (/គិតលុយ|គណនា|បូក|ដក|គុណ|ចែក|calc|calculat|sum|total|invoice|price/.test(t)) {
      screens.push({ type: 'calc', title: 'គណនា', payload: '' });
      found.push('គណនា');
    }
    if (/ទំនាក់ទំនង|ឈ្មោះ|ទូរស័ព្ទ|សារ|contact|form|feedback|email|phone/.test(t)) {
      screens.push({ type: 'form', title: 'ទំនាក់ទំនង', payload: '' });
      found.push('ទំនាក់ទំនង');
    }
    if (screens.length === 1) {
      screens.push({ type: 'list', title: 'បញ្ជី', payload: 'main' });
      found.push('បញ្ជី');
    }
    while (screens.length > 5) screens.pop();
    return { screens: screens, found: found };
  }

  function ktStr(s) {
    return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\t]+/g, ' ') + '"';
  }

  function descSpecKt(c, screens) {
    const rows = screens.map((s) => '        arrayOf(' + ktStr(s.title) + ', ' + ktStr(s.type) + ', ' + ktStr(s.payload) + ')');
    return [
      'package ' + c.pkg,
      '',
      '/** បង្កើតដោយ AppForge — កែឈ្មោះ/ពណ៌/អេក្រង់នៅទីនេះបាន។ */',
      'object AppSpec {',
      '    const val TITLE = ' + ktStr(c.name),
      '    const val BG = ' + ktStr('#0B0F14'),
      '    const val FG = ' + ktStr('#EAF2FF'),
      '    const val ACCENT = ' + ktStr(c.color),
      '',
      '    /** [ឈ្មោះបង្ហាញ, ប្រភេទ (home|list|calc|form|web), ទិន្នន័យបន្ថែម] */',
      '    val SCREENS: Array<Array<String>> = arrayOf(',
      rows.join(',\n'),
      '    )',
      '}',
      ''
    ].join('\n');
  }

  function descEngineKt(c) {
    return [
      'package ' + c.pkg,
      '',
      'import android.content.Intent',
      'import android.graphics.Color',
      'import android.net.Uri',
      'import android.os.Bundle',
      'import android.text.InputType',
      'import android.view.ViewGroup',
      'import android.webkit.WebView',
      'import android.webkit.WebViewClient',
      'import android.widget.ArrayAdapter',
      'import android.widget.Button',
      'import android.widget.EditText',
      'import android.widget.LinearLayout',
      'import android.widget.ListView',
      'import android.widget.ScrollView',
      'import android.widget.TextView',
      'import android.widget.Toast',
      'import androidx.appcompat.app.AppCompatActivity',
      '',
      'class MainActivity : AppCompatActivity() {',
      '',
      '    private lateinit var tabBar: LinearLayout',
      '    private lateinit var body: LinearLayout',
      '',
      '    override fun onCreate(savedInstanceState: Bundle?) {',
      '        super.onCreate(savedInstanceState)',
      '',
      '        val root = LinearLayout(this)',
      '        root.orientation = LinearLayout.VERTICAL',
      '        root.setBackgroundColor(Color.parseColor(AppSpec.BG))',
      '',
      '        val header = TextView(this)',
      '        header.text = AppSpec.TITLE',
      '        header.textSize = 20f',
      '        header.setTextColor(Color.parseColor(AppSpec.FG))',
      '        header.setPadding(dp(16), dp(18), dp(16), dp(10))',
      '',
      '        tabBar = LinearLayout(this)',
      '        tabBar.orientation = LinearLayout.HORIZONTAL',
      '        tabBar.setPadding(dp(10), 0, dp(10), dp(8))',
      '',
      '        body = LinearLayout(this)',
      '        body.orientation = LinearLayout.VERTICAL',
      '        body.setPadding(dp(16), dp(8), dp(16), dp(16))',
      '',
      '        val scroll = ScrollView(this)',
      '        scroll.addView(body)',
      '',
      '        root.addView(header)',
      '        root.addView(tabBar)',
      '        root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))',
      '        setContentView(root)',
      '',
      '        showScreen(0)',
      '    }',
      '',
      '    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()',
      '',
      '    private fun buildTabs(active: Int) {',
      '        tabBar.removeAllViews()',
      '        for (i in AppSpec.SCREENS.indices) {',
      '            val tab = TextView(this)',
      '            tab.text = AppSpec.SCREENS[i][0]',
      '            tab.textSize = 14f',
      '            tab.setPadding(dp(12), dp(8), dp(12), dp(8))',
      '            tab.setTextColor(Color.parseColor(if (i == active) "#04231B" else AppSpec.FG))',
      '            tab.setBackgroundColor(Color.parseColor(if (i == active) AppSpec.ACCENT else "#16202B"))',
      '            val lp = LinearLayout.LayoutParams(',
      '                ViewGroup.LayoutParams.WRAP_CONTENT,',
      '                ViewGroup.LayoutParams.WRAP_CONTENT',
      '            )',
      '            lp.marginEnd = dp(6)',
      '            tab.setOnClickListener { showScreen(i) }',
      '            tabBar.addView(tab, lp)',
      '        }',
      '    }',
      '',
      '    private fun showScreen(index: Int) {',
      '        buildTabs(index)',
      '        body.removeAllViews()',
      '        val screen = AppSpec.SCREENS[index]',
      '        when (screen[1]) {',
      '            "list" -> buildList(screen[2])',
      '            "calc" -> buildCalc()',
      '            "form" -> buildForm()',
      '            "web" -> buildWeb(screen[2])',
      '            else -> buildHome()',
      '        }',
      '    }',
      '',
      '    private fun titleView(text: String): TextView {',
      '        val v = TextView(this)',
      '        v.text = text',
      '        v.textSize = 16f',
      '        v.setTextColor(Color.parseColor(AppSpec.FG))',
      '        v.setPadding(0, 0, 0, dp(10))',
      '        return v',
      '    }',
      '',
      '    private fun buildHome() {',
      '        var taps = 0',
      '        val counter = TextView(this)',
      '        counter.text = "អ្នកចុច 0 ដង"',
      '        counter.setTextColor(Color.parseColor(AppSpec.FG))',
      '        counter.setPadding(0, dp(10), 0, dp(10))',
      '        val button = Button(this)',
      '        button.text = "ចុចទីនេះ"',
      '        button.setOnClickListener {',
      '            taps += 1',
      '            counter.text = "អ្នកចុច " + taps + " ដង"',
      '        }',
      '        body.addView(titleView("សូមស្វាគមន៍មកកាន់ " + AppSpec.TITLE))',
      '        body.addView(counter)',
      '        body.addView(button)',
      '    }',
      '',
      '    private fun buildList(key: String) {',
      '        val items = ArrayList<String>()',
      '        val prefs = getSharedPreferences("app", MODE_PRIVATE)',
      '        val saved = prefs.getString("list_" + key, "") ?: ""',
      '        if (saved.isNotEmpty()) items.addAll(saved.split("\\n"))',
      '',
      '        val input = EditText(this)',
      '        input.hint = "បញ្ចូលអ្វីមួយ…"',
      '        val addBtn = Button(this)',
      '        addBtn.text = "បន្ថែម"',
      '        val listView = ListView(this)',
      '        val hint = TextView(this)',
      '        hint.text = "ចុចឱ្យយូរលើជួរដើម្បីលុប"',
      '        hint.textSize = 12f',
      '        hint.setTextColor(Color.parseColor("#8FA1B8"))',
      '        hint.setPadding(0, dp(8), 0, 0)',
      '',
      '        fun refresh() {',
      '            listView.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, items)',
      '        }',
      '        fun persist() {',
      '            prefs.edit().putString("list_" + key, items.joinToString("\\n")).apply()',
      '        }',
      '',
      '        refresh()',
      '',
      '        val row = LinearLayout(this)',
      '        row.orientation = LinearLayout.HORIZONTAL',
      '        row.addView(input, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))',
      '        row.addView(addBtn)',
      '',
      '        addBtn.setOnClickListener {',
      '            val text = input.text.toString().trim()',
      '            if (text.isNotEmpty()) {',
      '                items.add(0, text)',
      '                input.setText("")',
      '                refresh()',
      '                persist()',
      '            }',
      '        }',
      '',
      '        listView.setOnItemLongClickListener { _, _, position, _ ->',
      '            items.removeAt(position)',
      '            refresh()',
      '            persist()',
      '            Toast.makeText(this, "លុបរួច", Toast.LENGTH_SHORT).show()',
      '            true',
      '        }',
      '',
      '        body.addView(titleView("បញ្ជី"))',
      '        body.addView(row)',
      '        body.addView(listView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(360)))',
      '        body.addView(hint)',
      '    }',
      '',
      '    private fun buildCalc() {',
      '        val a = EditText(this)',
      '        a.hint = "លេខទី១"',
      '        a.inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL',
      '        val b = EditText(this)',
      '        b.hint = "លេខទី២"',
      '        b.inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL',
      '        val result = TextView(this)',
      '        result.text = "= 0"',
      '        result.textSize = 22f',
      '        result.setTextColor(Color.parseColor(AppSpec.ACCENT))',
      '        result.setPadding(0, dp(12), 0, 0)',
      '',
      '        fun compute(op: String) {',
      '            val x = a.text.toString().toDoubleOrNull()',
      '            val y = b.text.toString().toDoubleOrNull()',
      '            if (x == null || y == null) {',
      '                result.text = "សូមបញ្ចូលលេខទាំងពីរ"',
      '                return',
      '            }',
      '            result.text = "= " + when (op) {',
      '                "+" -> x + y',
      '                "-" -> x - y',
      '                "*" -> x * y',
      '                else -> if (y == 0.0) 0.0 else x / y',
      '            }',
      '        }',
      '',
      '        val ops = LinearLayout(this)',
      '        ops.orientation = LinearLayout.HORIZONTAL',
      '        for (op in listOf("+", "-", "*", "/")) {',
      '            val btn = Button(this)',
      '            btn.text = op',
      '            btn.setOnClickListener { compute(op) }',
      '            ops.addView(btn)',
      '        }',
      '',
      '        body.addView(titleView("គិតលុយ / គណនា"))',
      '        body.addView(a)',
      '        body.addView(b)',
      '        body.addView(ops)',
      '        body.addView(result)',
      '    }',
      '',
      '    private fun buildForm() {',
      '        val name = EditText(this)',
      '        name.hint = "ឈ្មោះ"',
      '        val phone = EditText(this)',
      '        phone.hint = "លេខទូរស័ព្ទ"',
      '        phone.inputType = InputType.TYPE_CLASS_PHONE',
      '        val msg = EditText(this)',
      '        msg.hint = "សារ"',
      '        val out = TextView(this)',
      '        out.setTextColor(Color.parseColor(AppSpec.FG))',
      '        out.setPadding(0, dp(12), 0, 0)',
      '',
      '        val save = Button(this)',
      '        save.text = "រក្សាទុក"',
      '        save.setOnClickListener {',
      '            getSharedPreferences("app", MODE_PRIVATE).edit()',
      '                .putString("form_name", name.text.toString())',
      '                .putString("form_phone", phone.text.toString())',
      '                .putString("form_msg", msg.text.toString())',
      '                .apply()',
      '            out.text = "បានរក្សាទុក: " + name.text.toString()',
      '        }',
      '',
      '        val send = Button(this)',
      '        send.text = "ផ្ញើអ៊ីមែល"',
      '        send.setOnClickListener {',
      '            val intent = Intent(Intent.ACTION_SENDTO)',
      '            intent.data = Uri.parse("mailto:")',
      '            intent.putExtra(Intent.EXTRA_TEXT, msg.text.toString())',
      '            try {',
      '                startActivity(intent)',
      '            } catch (e: Exception) {',
      '                Toast.makeText(this, "មិនមាន app អ៊ីមែល", Toast.LENGTH_SHORT).show()',
      '            }',
      '        }',
      '',
      '        body.addView(titleView("ទំនាក់ទំនង"))',
      '        body.addView(name)',
      '        body.addView(phone)',
      '        body.addView(msg)',
      '        body.addView(save)',
      '        body.addView(send)',
      '        body.addView(out)',
      '    }',
      '',
      '    private fun buildWeb(url: String) {',
      '        val web = WebView(this)',
      '        web.settings.javaScriptEnabled = true',
      '        web.settings.domStorageEnabled = true',
      '        web.webViewClient = WebViewClient()',
      '        web.loadUrl(url)',
      '        body.addView(titleView("វេបសាយ"))',
      '        body.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(480)))',
      '    }',
      '}',
      ''
    ].join('\n');
  }

  function buildDescProject(c) {
    const parsed = descScreens(c.description);
    const files = [];
    const add = (path, text) => files.push({ path: path, text: text });
    const hasInternet = parsed.screens.some((s) => s.type === 'web');

    add('settings.gradle.kts', settingsGradle(c));
    add('build.gradle.kts', rootGradle());
    add('gradle.properties', [
      'org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8',
      'android.useAndroidX=true',
      'kotlin.code.style=official',
      'android.nonTransitiveRClass=true',
      ''
    ].join('\n'));
    add('app/build.gradle.kts', appGradle(c));
    add('app/proguard-rules.pro', '# Keep rules go here.\n');
    add('app/src/main/AndroidManifest.xml', manifest(c, hasInternet));
    add('app/src/main/res/values/strings.xml', stringsXml(c));
    add('app/src/main/res/values/colors.xml', colorsXml(c));
    add('app/src/main/res/values/themes.xml', themesXml(c));
    if (c.dark) add('app/src/main/res/values-night/themes.xml', themesNightXml(c));
    add('app/src/main/res/drawable/ic_launcher.xml', launcherXml(c));

    const srcDir = 'app/src/main/java/' + c.pkg.split('.').join('/');
    add(srcDir + '/MainActivity.kt', descEngineKt(c));
    add(srcDir + '/AppSpec.kt', descSpecKt(c, parsed.screens));

    add('.github/workflows/build-apk.yml', workflowYaml(c));
    add('README.md', readme(c));
    add('.gitignore', gitignore());

    return { config: c, screens: parsed.screens, found: parsed.found, files: files };
  }

  /* ------------------------------- self-check ------------------------------- */
  /* Runs the same structural checks a build would fail on, so the page can say
     whether what it just generated is actually sound instead of hoping. */
  function xmlIssue(text) {
    const stack = [];
    const re = /<\/?([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const whole = m[0];
      const name = m[1];
      if (whole.startsWith('<?') || whole.startsWith('<!')) continue;
      if (whole.startsWith('</')) {
        const open = stack.pop();
        if (open !== name) return 'unexpected </' + name + '>';
      } else if (m[3] !== '/') {
        stack.push(name);
      }
    }
    return stack.length ? 'unclosed <' + stack[stack.length - 1] + '>' : '';
  }

  /* ------------------------------- auto fix -------------------------------- */

  /* A web project starts from a page; give one to a project that has none so a
     build never fails on a file the app could not run without anyway. */
  function starterIndex(name) {
    const title = String(name || 'App').replace(/[<>&"']/g, '');
    return [
      '<!doctype html>',
      '<html lang="km">',
      '<head>',
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      '  <title>' + title + '</title>',
      '  <style>',
      '    body { margin: 0; min-height: 100vh; display: grid; place-items: center;',
      '      font-family: system-ui, sans-serif; background: #0e1117; color: #e6edf5; }',
      '    h1 { font-size: 22px; }',
      '  </style>',
      '</head>',
      '<body>',
      '  <h1>' + title + '</h1>',
      '</body>',
      '</html>',
      ''
    ].join('\n');
  }

  /* Kotlin forbids `const` on a local variable, and the fix is always to drop the
     modifier. Blocks are tracked so a `const val` inside a companion object --
     where it is legal -- is left alone. */
  function fixLocalConst(text) {
    const lines = text.split('\n');
    const stack = [];
    let inBlockComment = false;
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (inBlockComment) {
        if (trimmed.indexOf('*/') >= 0) inBlockComment = false;
        continue;
      }
      if (trimmed.indexOf('/*') >= 0 && trimmed.indexOf('*/') < 0) {
        inBlockComment = true;
        continue;
      }
      if (trimmed.indexOf('//') === 0) continue;
      let opened = 0;
      let closed = 0;
      for (let c = 0; c < trimmed.length; c++) {
        if (trimmed[c] === '{') opened++;
        else if (trimmed[c] === '}') closed++;
      }
      const head = trimmed.split('{')[0];
      const kind = /\bfun\b/.test(head) ? 'fun'
        : /\b(class|object|interface)\b/.test(head) ? 'type' : 'block';
      if (/^\s*const\s+val\b/.test(line) && stack.indexOf('fun') >= 0) {
        lines[i] = line.replace(/(\s)const\s+val\b/, '$1val');
        count++;
      }
      for (let o = 0; o < opened; o++) stack.push(kind);
      for (let c2 = 0; c2 < closed; c2++) stack.pop();
    }
    return { text: lines.join('\n'), count: count };
  }

  /* Uses of sqrt/hypot/abs and friends without their kotlin.math import. */
  function addMathImports(text) {
    const names = ['sqrt', 'hypot', 'abs', 'atan2', 'cos', 'sin', 'tan', 'pow', 'PI'];
    const missing = [];
    names.forEach((name) => {
      const used = name === 'PI' ? /\bPI\b/.test(text) : new RegExp('\\b' + name + '\\s*\\(').test(text);
      if (!used) return;
      if (new RegExp('import\\s+kotlin\\.math\\.' + name + '\\b').test(text)) return;
      if (/import\s+kotlin\.math\.\*/.test(text)) return;
      if (new RegExp('(fun|val|var|class|object)\\s+' + name + '\\b').test(text)) return;
      missing.push(name);
    });
    if (!missing.length) return { text: text, added: [] };
    const lines = text.split('\n');
    let at = -1;
    lines.forEach((line, i) => { if (/^\s*import\s+/.test(line)) at = i; });
    if (at < 0) lines.forEach((line, i) => { if (/^\s*package\s+/.test(line)) at = i; });
    const block = missing.map((name) => 'import kotlin.math.' + name);
    lines.splice(at + 1, 0, block.join('\n'));
    return { text: lines.join('\n'), added: missing };
  }

  /**
   * Repairs a project before it is built.
   *
   * Only changes with a single correct form are made -- a missing or wrong
   * package line, `const val` inside a function, a missing kotlin.math import,
   * and a web project with no start page. Everything else is left to the
   * compiler, whose messages are shown to the user.
   */
  /* A manifest that points at an icon the project does not ship is the most
     common first-build failure ("AAPT: error: resource mipmap/ic_launcher not
     found"), because the manifest is the one file users edit by hand. Point it
     at the icon that does exist, or create the missing one. */
  function fixIconRefs(cfg, list) {
    const manifest = list.filter((f) => f.path === 'app/src/main/AndroidManifest.xml')[0];
    if (!manifest || typeof manifest.text !== 'string') return [];
    const have = { mipmap: {}, drawable: {} };
    list.forEach((f) => {
      const m = String(f.path).match(/^app\/src\/main\/res\/(mipmap|drawable)(?:-[A-Za-z0-9]+)?\/([A-Za-z0-9_]+)\.(?:xml|png|webp|jpe?g)$/);
      if (m) have[m[1]][m[2]] = f.path;
    });
    const fixes = [];
    let text = manifest.text;
    ['android:icon', 'android:roundIcon'].forEach((attr) => {
      const re = new RegExp('(' + attr + '=")@mipmap\\/([A-Za-z0-9_]+)(")');
      const ref = text.match(re);
      if (!ref) return;
      const name = ref[2];
      if (have.mipmap[name]) return;
      if (have.drawable[name]) {
        text = text.replace(re, '$1@drawable/' + name + '$3');
        fixes.push('AndroidManifest.xml: @mipmap/' + name + ' → @drawable/' + name + ' (mipmap មិនមាន)');
        return;
      }
      const path = 'app/src/main/res/drawable/' + name + '.xml';
      if (!list.some((f) => f.path === path)) {
        list.push({ path: path, text: launcherXml({ color: (cfg && cfg.color) || '#12B886' }) });
        fixes.push(path + ': បង្កើតរូបតំណាងដែល Manifest យោង');
      }
      text = text.replace(re, '$1@drawable/' + name + '$3');
      fixes.push('AndroidManifest.xml: @mipmap/' + name + ' → @drawable/' + name);
    });
    if (text !== manifest.text) manifest.text = text;
    return fixes;
  }

  function autoFix(cfg, projectFiles) {
    const list = Array.isArray(projectFiles) ? projectFiles : [];
    const pkg = String((cfg && cfg.pkg) || '').trim();
    const fixes = [];
    const out = list.map((f) => Object.assign({}, f));

    const original = {};
    out.forEach((f) => {
      if (typeof f.text !== 'string' || !/\.(kt|java)$/.test(f.path)) return;
      original[f.path] = ((f.text.match(/^\s*package\s+([A-Za-z0-9_.]+)/m) || [])[1]) || '';
    });

    out.forEach((f) => {
      if (typeof f.text !== 'string' || !/\.kt$/.test(f.path)) return;
      let text = f.text.replace(/^\uFEFF/, '');
      const declared = text.match(/^\s*package\s+([A-Za-z0-9_.]+)\s*$/m);
      if (!declared && pkg) {
        text = 'package ' + pkg + '\n\n' + text;
        fixes.push(f.path + ': បន្ថែម package ' + pkg);
      } else if (declared && pkg && declared[1] !== pkg) {
        text = text.replace(declared[0], 'package ' + pkg);
        fixes.push(f.path + ': package ' + declared[1] + ' → ' + pkg);
      }
      const constant = fixLocalConst(text);
      if (constant.count) {
        text = constant.text;
        fixes.push(f.path + ': ' + constant.count + ' × const val ក្នុង function → val');
      }
      const math = addMathImports(text);
      if (math.added.length) {
        text = math.text;
        fixes.push(f.path + ': បន្ថែម import kotlin.math.' + math.added.join(', kotlin.math.'));
      }
      f.text = text;
    });

    // Every .kt file was just moved onto the panel's package, so a manifest that
    // still spells an older package is the single thing AAPT2 refuses before any
    // code is compiled. It is the same assignment as above, only in XML.
    out.forEach((f) => {
      if (f.path !== 'app/src/main/AndroidManifest.xml' || typeof f.text !== 'string' || !pkg) return;
      const attr = f.text.match(/\spackage\s*=\s*"([A-Za-z0-9_.]+)"/);
      if (!attr || attr[1] === pkg) return;
      const old = attr[1];
      f.text = f.text.replace(attr[0], ' package="' + pkg + '"')
        .split('android:name="' + old + '.').join('android:name="' + pkg + '.');
      fixes.push('AndroidManifest.xml: package ' + old + ' → ' + pkg);
    });

    /* Two files that end up declaring one class stop kotlinc with "Redeclaration"
       and name only the classes. A copy left in another package's folder is the
       usual cause, so move that one out of the compiled source set instead of
       deleting it: the build runs and nothing the user wrote is lost. */
    const declOf = (text) => {
      const pkg = ((text.match(/^\s*package\s+([A-Za-z0-9_.]+)/m) || [])[1]) || '';
      const names = [];
      const re = /^(?:@[\w.]+(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|internal|abstract|final|open|data|sealed|inner|enum|static|annotation)\s+)*(?:class|object|interface|record)\s+([A-Za-z_]\w*)/gm;
      let m;
      while ((m = re.exec(text))) names.push((pkg ? pkg + '.' : '') + m[1]);
      return { pkg: pkg, names: names };
    };
    const byClass = {};
    out.forEach((f) => {
      if (typeof f.text !== 'string' || !/\.(kt|java)$/.test(f.path)) return;
      declOf(f.text).names.forEach((n) => { (byClass[n] = byClass[n] || []).push(f); });
    });
    const folderOf = (path) => String(path).replace(/^(app\/src\/main\/(?:java|kotlin)\/)/, '')
      .replace(/\.[A-Za-z]+$/, '').split('/').slice(0, -1).join('.');
    // The WebView activity this generator writes is not user code: a project that
    // brings its own MainActivity keeps it and the generated twin is dropped.
    const isGeneratedActivity = (f) => /appassets\.androidplatform\.net/.test(f.text) &&
      /START_URL/.test(f.text) && /class MainActivity/.test(f.text);
    Object.keys(byClass).forEach((fq) => {
      const group = Array.from(new Set(byClass[fq]));
      if (group.length < 2) return;
      // A generated twin is handled in buildProject (it owns that file), so only a
      // duplicate between files the user wrote needs moving here.
      if (group.some(isGeneratedActivity)) return;
      const keeper = group.filter((f) => folderOf(f.path) === original[f.path])[0] || group[0];
      group.forEach((f) => {
        if (f === keeper) return;
        const at = out.indexOf(f);
        if (at < 0) return;
        const moved = 'unused/' + f.path.replace(/^app\/src\/main\/(?:java|kotlin)\//, '');
        out[at] = { path: moved, text: f.text };
        fixes.push(f.path + ' → ' + moved + ': class ' + fq + ' ស្ទួន (មិនលុប — ផ្លាស់ចេញពី app/src ដើម្បីកុំឱ្យ kotlinc បរាជ័យ)');
      });
    });

    fixIconRefs(cfg, out).forEach((line) => fixes.push(line));

    // The WebView needs a start page, and a project with no Android files at all
    // is a web project, so either way this is the file the APK opens first.
    const hasIndex = out.some((f) => f.path === 'index.html');
    const native = out.some((f) => /^(app\/src\/main|build\.gradle|settings\.gradle)/.test(f.path));
    // A web project always needs one; a native one only when it already ships
    // web assets, because that WebView loads nothing without a start page.
    const www = out.some((f) => f.path.indexOf('app/src/main/assets/www/') === 0);
    const wwwIndex = out.some((f) => f.path === 'app/src/main/assets/www/index.html');
    if (!hasIndex && !native) {
      out.push({ path: 'index.html', text: starterIndex((cfg && cfg.name) || 'App') });
      fixes.push('index.html: បង្កើតទំព័រចាប់ផ្ដើម (បើកដំណើរការ APK)');
    } else if (!hasIndex && www && !wwwIndex) {
      out.push({ path: 'index.html', text: starterIndex((cfg && cfg.name) || 'App') });
      fixes.push('index.html: បង្កើតទំព័រចាប់ផ្ដើមសម្រាប់ WebView');
    }

    return { files: out, fixes: fixes };
  }

  function verify(result) {
    const issues = [];
    const files = (result && result.files) || [];
    const cfg = (result && result.config) || {};
    if (!files.length) return { ok: false, issues: ['មិនមានឯកសារ'] };
    const map = {};
    files.forEach((f) => { map[f.path] = f.text; });

    const required = [
      'app/src/main/AndroidManifest.xml', 'app/src/main/res/values/strings.xml',
      '.github/workflows/build-apk.yml', 'README.md'
    ];
    required.forEach((p) => { if (!map[p]) issues.push('ខ្វះ ' + p); });
    if (!map['settings.gradle.kts'] && !map['settings.gradle']) issues.push('ខ្វះ settings.gradle(.kts)');
    if (!map['build.gradle.kts'] && !map['build.gradle']) issues.push('ខ្វះ build.gradle(.kts)');
    if (!map['app/build.gradle.kts'] && !map['app/build.gradle']) issues.push('ខ្វះ app/build.gradle(.kts)');

    if (!files.some((f) => /MainActivity\.(kt|java)$/.test(f.path))) issues.push('ខ្វះ MainActivity (kt/java)');

    // Check the script Gradle actually reads: Groovy wins over Kotlin DSL.
    const groovyApp = map['app/build.gradle'] || '';
    const ktsApp = map['app/build.gradle.kts'] || '';
    const gradle = groovyApp || ktsApp;
    if (groovyApp && ktsApp) issues.push('មាន app/build.gradle និង app/build.gradle.kts ទាំងពីរ — Gradle ប្រើតែ Groovy');
    const quoted = String(cfg.pkg || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (cfg.pkg && !new RegExp('applicationId\\s*=?\\s*[\'"]' + quoted + '[\'"]').test(gradle)) issues.push('applicationId មិនត្រូវនឹង package');
    if (cfg.pkg && !new RegExp('namespace\\s*=?\\s*[\'"]' + quoted + '[\'"]').test(gradle)) issues.push('namespace មិនត្រូវនឹង package');
    if (!/versionCode\s*=?\s*\d+/.test(gradle)) issues.push('ខ្វះ versionCode');
    const sdk = (gradle.match(/compileSdk\s*=?\s*(\d+)/) || [])[1];
    if (!sdk) issues.push('ខ្វះ compileSdk');
    else if (Number(sdk) < 34) issues.push('compileSdk ' + sdk + ' — ត្រូវការ 34+');
    if (files.some((f) => /\.kt$/.test(f.path)) && gradle && !/org\.jetbrains\.kotlin\.android/.test(gradle)) {
      issues.push('ខ្វះ plugin org.jetbrains.kotlin.android តែមានឯកសារ .kt');
    }

    files.forEach((f) => {
      if (typeof f.text === 'string' && !f.text.trim()) issues.push('ឯកសារទទេ: ' + f.path);
      if (f.path.endsWith('.kt')) {
        if (cfg.pkg && !f.text.includes('package ' + cfg.pkg)) issues.push('package ខុស: ' + f.path);
        const pairs = [['{', '}'], ['(', ')']];
        pairs.forEach(([o, c]) => {
          if (f.text.split(o).length !== f.text.split(c).length) issues.push('សញ្ញា ' + o + c + ' មិនតុល្យភាព: ' + f.path);
        });
      }
      if (f.path.endsWith('.xml')) {
        const bad = xmlIssue(f.text);
        if (bad) issues.push(f.path + ': ' + bad);
      }
    });

    const theme = 'Theme.' + pascal(cfg.name || 'My App');
    const manifest = map['app/src/main/AndroidManifest.xml'] || '';

    // The mismatch AAPT reports three minutes later, caught before the push.
    (manifest.match(/android:(?:icon|roundIcon)="@mipmap\/([A-Za-z0-9_]+)"/g) || []).forEach((ref) => {
      const name = ref.split('/').pop().replace(/"$/, '');
      const pattern = new RegExp('^app/src/main/res/mipmap(?:-[a-z0-9]+)?/' + name + '\\.(?:xml|png|webp|jpe?g)$');
      if (!files.some((f) => pattern.test(f.path))) {
        issues.push('Manifest យោង @mipmap/' + name + ' តែគ្មាន res/mipmap/' + name + ' — AAPT នឹងបរាជ័យ');
      }
    });

    // AAPT2 refuses a manifest whose package= differs from the module namespace,
    // and its message names neither file that has to change.
    const manPkg = (manifest.match(/package="([\w.]+)"/) || [])[1];
    const namespace = (gradle.match(/namespace\s*=?\s*['"]([\w.]+)['"]/) || [])[1];
    if (manPkg && namespace && manPkg !== namespace) {
      issues.push('AndroidManifest package="' + manPkg + '" ខុសពី namespace="' + namespace +
        '" ក្នុង app/build.gradle.kts — ត្រូវឱ្យដូចគ្នា បើមិនដូច្នេះ AAPT បរាជ័យ');
    }

    if (cfg.template === 'system') {
      ['SYSTEM_ALERT_WINDOW', 'FOREGROUND_SERVICE_SPECIAL_USE', 'RECEIVE_BOOT_COMPLETED',
        'WRITE_SETTINGS'].forEach((p) => {
        if (!manifest.includes('android.permission.' + p)) issues.push('ខ្វះ permission ' + p);
      });
      if (!manifest.includes('.OverlayService')) issues.push('ខ្វះ service OverlayService');
      if (!manifest.includes('.BootReceiver')) issues.push('ខ្វះ receiver BootReceiver');
      if (!manifest.includes('.AdminReceiver')) issues.push('ខ្វះ receiver AdminReceiver');
      ['OverlayService.kt', 'SystemOps.kt', 'AdminReceiver.kt', 'BootReceiver.kt'].forEach((f) => {
        if (!files.some((x) => x.path.endsWith('/' + f))) issues.push('ខ្វះ ' + f);
      });
    }
    if (cfg.template === 'agent') {
      ['INTERNET', 'SYSTEM_ALERT_WINDOW', 'FOREGROUND_SERVICE_SPECIAL_USE', 'QUERY_ALL_PACKAGES'].forEach((p) => {
        if (!manifest.includes('android.permission.' + p)) issues.push('ខ្វះ permission ' + p);
      });
      if (!manifest.includes('.AgentAccessibilityService')) issues.push('ខ្វះ service AgentAccessibilityService');
      if (!manifest.includes('BIND_ACCESSIBILITY_SERVICE')) issues.push('ខ្វះ BIND_ACCESSIBILITY_SERVICE');
      ['OverlayService.kt', 'AgentAccessibilityService.kt', 'AgentRunner.kt', 'GroqClient.kt'].forEach((f) => {
        if (!files.some((x) => x.path.endsWith('/' + f))) issues.push('ខ្វះ ' + f);
      });
      if (!files.some((x) => x.path === 'app/src/main/res/xml/accessibility_config.xml')) {
        issues.push('ខ្វះ res/xml/accessibility_config.xml ដែល manifest យោង');
      }
    }
    const themes = map['app/src/main/res/values/themes.xml'] || '';
    if (manifest.includes('@style/' + theme) && !themes.includes('name="' + theme + '"')) {
      issues.push('theme ' + theme + ' មិនមានក្នុង themes.xml');
    }

    const wf = map['.github/workflows/build-apk.yml'] || '';
    if (!wf.includes('assembleDebug')) issues.push('workflow: ខ្វះ assembleDebug');
    if (!wf.includes('upload-artifact')) issues.push('workflow: ខ្វះ upload-artifact');
    if (!wf.includes('java-version')) issues.push('workflow: ខ្វះ JDK');

    // A project that ships its own manifest decides its permissions; only the
    // manifest this generator wrote is expected to carry INTERNET.
    const own = !!(result && result.ownManifest);
    if (cfg.template === 'webview' && !own && !manifest.includes('android.permission.INTERNET')) {
      issues.push('ខ្វះ INTERNET permission');
    }
    if (cfg.template === 'webview' && cfg.pull && !map['app/src/main/res/layout/activity_main.xml']) {
      issues.push('Refresh បើកតែគ្មាន layout');
    }
    // Only a real web page needs a start file; README and .gitignore are copied
    // into assets/www by the builder and do not make this a web project.
    const pageLike = files.filter((f) => f.path.indexOf('app/src/main/assets/www/') === 0 &&
      /\.(html?|css|js|mjs|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|json)$/i.test(f.path));
    if (pageLike.length && !map['app/src/main/assets/www/index.html']) {
      issues.push('ខ្វះ index.html នៅ root គម្រោង (វាជាចំណុចចាប់ផ្តើមរបស់ WebView)');
    }

    /* Failures that always end in a red Gradle run: a Material theme or
       androidx imports whose library the build script never declares. */
    const blockers = [];
    if (manPkg && namespace && manPkg !== namespace) {
      blockers.push('AndroidManifest package="' + manPkg + '" ខុសពី namespace="' + namespace +
        '" — AAPT នឹងបរាជ័យរាល់ដង ដូច្នេះ build ត្រូវឈប់នៅទីនេះ');
    }
    const xmlAll = files.filter((f) => typeof f.text === 'string' && /\.xml$/.test(f.path)).map((f) => f.text).join('\n');
    const codeAll = files.filter((f) => typeof f.text === 'string' && /\.(kt|java)$/.test(f.path)).map((f) => f.text).join('\n');
    // Two files declaring the same package + class make kotlinc/javac stop with
    // "Redeclaration" and name only the two classes, never what to change.
    const decls = {};
    files.forEach((f) => {
      if (typeof f.text !== 'string' || !/\.(kt|java)$/.test(f.path)) return;
      // Only what Gradle compiles can collide; moved-aside copies under
      // app/src/main/assets are shipped as assets, not compiled.
      if (!/^app\/src\/main\/(java|kotlin)\//.test(f.path)) return;
      const pkg = ((f.text.match(/^\s*package\s+([\w.]+)/m) || [])[1]) || '';
      const re = /^(?:@[\w.]+(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|internal|abstract|final|open|data|sealed|inner|enum|static|annotation)\s+)*(?:class|object|interface|record)\s+([A-Za-z_]\w*)/gm;
      let m;
      while ((m = re.exec(f.text))) {
        const fq = (pkg ? pkg + '.' : '') + m[1];
        (decls[fq] = decls[fq] || []).push(f.path);
      }
    });
    Object.keys(decls).forEach((fq) => {
      const from = Array.from(new Set(decls[fq]));
      if (from.length > 1) {
        blockers.push('class ' + fq + ' មាននៅ ' + from.length + ' ឯកសារ: ' + from.join(', ') +
          ' — kotlinc បរាជ័យដោយ "Redeclaration" ដូច្នេះ build ឈប់នៅទីនេះ; លុបមួយ ឬប្តូរឈ្មោះ class និង package');
      }
    });
    if (/parent="Theme\.Material(3|Components)\./.test(xmlAll) && gradle && !/com\.google\.android\.material:material/.test(gradle)) {
      blockers.push('theme ប្រើ Theme.Material3 តែ build script គ្មាន com.google.android.material:material');
    }
    const androidx = Array.from(new Set((codeAll.match(/import\s+androidx\.[A-Za-z0-9_.]+/g) || []).map((s) => s.replace(/^import\s+/, ''))));
    if (androidx.length && gradle && !/androidx\./.test(gradle)) {
      blockers.push('កូដ import ' + androidx.slice(0, 3).join(', ') + (androidx.length > 3 ? ' …' : '') +
        ' — តែ build script គ្មាន androidx dependency');
    }

    return { ok: issues.length === 0, issues: issues, blockers: blockers };
  }

  /* ------------------------------- snippets -------------------------------- */

  const SNIPPETS = [
    {
      id: 'toast',
      title: 'បង្ហាញ Toast',
      desc: 'សារខ្លីៗនៅបាតអេក្រង់',
      code: 'Toast.makeText(this, "សូមស្វាគមន៍", Toast.LENGTH_SHORT).show()'
    },
    {
      id: 'share',
      title: 'ចែករំលែក (Share)',
      desc: 'បញ្ជូនអត្ថបទទៅ app ផ្សេង',
      code: [
        'val send = Intent(Intent.ACTION_SEND).apply {',
        '    type = "text/plain"',
        '    putExtra(Intent.EXTRA_TEXT, "សាររបស់ខ្ញុំ")',
        '}',
        'startActivity(Intent.createChooser(send, "ចែករំលែកតាម"))'
      ].join('\n')
    },
    {
      id: 'http',
      title: 'ទាញទិន្នន័យពី API',
      desc: 'GET JSON ដោយ HttpURLConnection (គ្មាន library)',
      code: [
        'Thread {',
        '    val url = URL("https://api.example.com/data")',
        '    val json = url.openConnection().getInputStream()',
        '        .bufferedReader().use { it.readText() }',
        '    runOnUiThread { label.text = json }',
        '}.start()'
      ].join('\n')
    },
    {
      id: 'dark',
      title: 'ពិនិត្យ Dark mode',
      desc: 'ស្គាល់ថាទូរស័ព្ទកំពុងប្រើ theme ងងឹត',
      code: [
        'val night = resources.configuration.uiMode and',
        '    Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES'
      ].join('\n')
    },
    {
      id: 'permission',
      title: 'សុំ Permission',
      desc: 'ឧ. កាមេរ៉ា (ត្រូវប្រកាសក្នុង Manifest ដែរ)',
      code: [
        'ActivityCompat.requestPermissions(',
        '    this,',
        '    arrayOf(Manifest.permission.CAMERA),',
        '    100',
        ')'
      ].join('\n')
    },
    {
      id: 'notify',
      title: 'ផ្ញើ Notification',
      desc: 'បង្ហាញការជូនដំណឹង (ត្រូវសុំ POST_NOTIFICATIONS លើ Android 13+)',
      code: [
        'val nm = getSystemService(NotificationManager::class.java)',
        'val channel = NotificationChannel("main", "Main", NotificationManager.IMPORTANCE_DEFAULT)',
        'nm.createNotificationChannel(channel)',
        'nm.notify(1, Notification.Builder(this, "main")',
        '    .setSmallIcon(android.R.drawable.ic_dialog_info)',
        '    .setContentTitle("AppForge")',
        '    .setContentText("សូសារថ្មី")',
        '    .build())'
      ].join('\n')
    }
  ];

  return {
    TEMPLATES: TEMPLATES,
    SNIPPETS: SNIPPETS,
    normalize: normalize,
    parseDescription: descScreens,
    verify: verify,
    autoFix: autoFix,
    build: build,
    buildProject: buildProject,
    zip: zip
  };
});
