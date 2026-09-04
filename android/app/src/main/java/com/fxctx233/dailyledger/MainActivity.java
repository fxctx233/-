package com.fxctx233.dailyledger;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int EXPORT = 201, IMPORT = 202, BILLS = 203, LIMIT = 10 * 1024 * 1024;
    private static final Set<String> KEYS = new HashSet<>(Arrays.asList("xiaoman-ledger-v1", "xiaoman-ledger-v1-before-restore", "xiaoman-ledger-v1-before-import", "xiaoman-ledger-v1-before-bulk", "xiaoman-ledger-v1-before-clear", "xiaoman-theme", "xiaoman-backup-status"));
    private WebView web;
    private Store store;
    private String pendingExport;
    private boolean fileBusy;
    private ValueCallback<Uri[]> billCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        store = new Store();
        web = new WebView(this);
        web.setBackgroundColor(0xfff6f7f3);
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        // Only documents explicitly granted by the system picker; no broad storage permission.
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        web.addJavascriptInterface(new Bridge(), "DailyLedgerAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String path = u.getPath();
                if (!"https".equals(u.getScheme()) || !"appassets.androidplatform.net".equals(u.getHost()) || path == null || !path.startsWith("/app/") || path.contains("..")) return denied();
                String relative = path.substring(5);
                if (relative.isEmpty()) relative = "index.html";
                try {
                    String mime = relative.endsWith(".js") ? "text/javascript" : relative.endsWith(".css") ? "text/css" : relative.endsWith(".svg") ? "image/svg+xml" : "text/html";
                    Map<String,String> headers = new HashMap<>();
                    headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'");
                    headers.put("X-Content-Type-Options", "nosniff");
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, getAssets().open("web/" + relative));
                } catch (IOException ex) { return denied(); }
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) Toast.makeText(MainActivity.this, "界面加载失败，请更新 Android System WebView 后重试。", Toast.LENGTH_LONG).show();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileBusy) { callback.onReceiveValue(null); return true; }
                billCallback = callback;
                fileBusy = true;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                    .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                // Some providers label CSV/XLSX as generic binary, so let the local parser validate.
                try { startActivityForResult(intent, BILLS); }
                catch (RuntimeException e) {
                    fileBusy = false; billCallback = null; callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "无法打开文件选择器，请先将账单保存到下载目录。", Toast.LENGTH_LONG).show();
                }
                return true;
            }
            @Override public boolean onJsConfirm(WebView v, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setTitle("日常记账").setMessage(message)
                    .setPositiveButton("确认", (d,w)->result.confirm()).setNegativeButton("取消", (d,w)->result.cancel())
                    .setOnCancelListener(d->result.cancel()).show();
                return true;
            }
        });
        web.loadUrl(ORIGIN + "/app/index.html");
    }
    private WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    private class Store extends SQLiteOpenHelper {
        Store() { super(MainActivity.this, "daily-ledger.db", null, 1); }
        @Override public void onCreate(SQLiteDatabase db) { db.execSQL("CREATE TABLE local_data (name TEXT PRIMARY KEY, value TEXT NOT NULL)"); }
        @Override public void onUpgrade(SQLiteDatabase db, int old, int next) { throw new IllegalStateException("Unsupported schema version"); }
    }
    public final class Bridge {
        @JavascriptInterface public String getItem(String key) {
            if (!KEYS.contains(key)) throw new IllegalArgumentException("Unsupported key");
            try (Cursor c = store.getReadableDatabase().rawQuery("SELECT value FROM local_data WHERE name=?", new String[]{key})) { return c.moveToFirst() ? c.getString(0) : null; }
        }
        @JavascriptInterface public String setItem(String key, String value) {
            if (!KEYS.contains(key) || value == null || value.getBytes(StandardCharsets.UTF_8).length > LIMIT) return "invalid";
            try {
                ContentValues row = new ContentValues(); row.put("name",key); row.put("value",value);
                long id = store.getWritableDatabase().insertWithOnConflict("local_data",null,row,SQLiteDatabase.CONFLICT_REPLACE);
                return id == -1 ? "error" : "ok";
            } catch (RuntimeException e) { return "error"; }
        }
        @JavascriptInterface public void exportBackup(String name, String data) {
            if (data == null || data.getBytes(StandardCharsets.UTF_8).length > LIMIT) { emit("dailyLedgerFileResult","备份过大，无法导出。"); return; }
            runOnUiThread(()->{
                if(fileBusy) return;
                fileBusy=true; pendingExport=data;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, name == null ? "日常记账备份.json" : name.replaceAll("[\\\\/:*?\"<>|]", "_"));
                try { startActivityForResult(intent,EXPORT); } catch(RuntimeException e) {fileBusy=false;pendingExport=null;emit("dailyLedgerFileResult","无法打开系统文件保存器。");}
            });
        }
        @JavascriptInterface public void importBackup() {
            runOnUiThread(()->{
                if(fileBusy) return;
                fileBusy=true;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try { startActivityForResult(intent,IMPORT); } catch(RuntimeException e) {fileBusy=false;emit("dailyLedgerFileResult","无法打开系统文件选择器。");}
            });
        }
    }
    private void emit(String event, String detail) {
        runOnUiThread(()->{if(!isFinishing())web.evaluateJavascript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(event)+",{detail:"+JSONObject.quote(detail)+"}));",null);});
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request,result,data);
        if (request == BILLS) {
            fileBusy = false;
            ValueCallback<Uri[]> callback = billCallback; billCallback = null;
            if (callback == null) return;
            ArrayList<Uri> uris = new ArrayList<>();
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    if (count > 8) {
                        Toast.makeText(this, "一次最多选择 8 份账单。", Toast.LENGTH_LONG).show();
                        callback.onReceiveValue(null); return;
                    }
                    for (int i=0; i<count; i++) uris.add(data.getClipData().getItemAt(i).getUri());
                } else if (data.getData() != null) uris.add(data.getData());
            }
            for (Uri uri : uris) {
                if (uri == null || !"content".equals(uri.getScheme())) { callback.onReceiveValue(null); return; }
            }
            callback.onReceiveValue(uris.isEmpty() ? null : uris.toArray(new Uri[0]));
            return;
        }
        if(request!=EXPORT && request!=IMPORT) return;
        fileBusy=false;
        if(result!=RESULT_OK || data==null || data.getData()==null) {pendingExport=null;emit("dailyLedgerFileResult","cancelled");return;}
        Uri uri=data.getData();
        String exportText=pendingExport;pendingExport=null;
        new Thread(()->{
            try {
                if(request==EXPORT) {
                    if(exportText==null)throw new IOException("Missing export");
                    try(OutputStream stream=getContentResolver().openOutputStream(uri,"wt")) {
                        if(stream==null)throw new IOException("Missing output");stream.write(exportText.getBytes(StandardCharsets.UTF_8));stream.flush();
                    }
                    emit("dailyLedgerFileResult","saved");
                } else {
                    try(InputStream stream=getContentResolver().openInputStream(uri);ByteArrayOutputStream buffer=new ByteArrayOutputStream()) {
                        if(stream==null)throw new IOException("Missing input");byte[] chunk=new byte[8192];int n;
                        while((n=stream.read(chunk))!=-1){if(buffer.size()+n>LIMIT)throw new IOException("Too large");buffer.write(chunk,0,n);}
                        emit("dailyLedgerImport",buffer.toString("UTF-8"));
                    }
                }
            } catch(IOException|RuntimeException e){emit("dailyLedgerFileResult","文件操作失败，请确认文件可用、手机空间充足且备份不超过 10 MB。原账本未改变。");}
        },"ledger-file").start();
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.dispatchEvent(new Event('dailyLedgerBack',{cancelable:true}))", value->{
            if("true".equals(value)) new AlertDialog.Builder(this).setTitle("退出日常记账？").setMessage("已确认保存的账目会保留在手机中。")
                .setPositiveButton("退出",(d,w)->finish()).setNegativeButton("取消",null).show();
        });
    }
    @Override protected void onDestroy() {
        if (billCallback != null) { billCallback.onReceiveValue(null); billCallback = null; }
        web.removeJavascriptInterface("DailyLedgerAndroid");web.destroy();store.close();super.onDestroy();
    }
}
