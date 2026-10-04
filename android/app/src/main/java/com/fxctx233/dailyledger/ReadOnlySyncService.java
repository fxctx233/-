package com.fxctx233.dailyledger;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityManager;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.*;
import java.util.regex.Pattern;

public class ReadOnlySyncService extends AccessibilityService {
    static final String PREFS = "read_only_sync";
    static final String ALIPAY = "com.eg.android.AlipayGphone";
    static final String WECHAT = "com.tencent.mm";
    private static final Pattern AMOUNT = Pattern.compile("(?:[+\\-]?\\s*[¥￥]\\s*\\d{1,8}(?:\\.\\d{1,2})?|[+\\-]\\s*\\d{1,8}\\.\\d{2})");
    private static final String[] DANGER = {"支付密码", "请输入密码", "验证身份", "指纹验证", "人脸验证", "确认付款", "立即付款", "确认支付"};
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable inspect = () -> {
        inspectScheduled = false;
        inspectCurrentScreen();
    };
    private boolean inspectScheduled;
    private long lastAction;

    @Override protected void onServiceConnected() {
        super.onServiceConnected();
        if (running()) schedule(300);
    }

    private void schedule(long delay) {
        if (inspectScheduled || !running()) return;
        inspectScheduled = true;
        handler.postDelayed(inspect, delay);
    }

    static boolean isEnabled(Context context) {
        AccessibilityManager manager = (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (manager == null) return false;
        for (AccessibilityServiceInfo info : manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
            if (info.getResolveInfo() == null) continue;
            String packageName = info.getResolveInfo().serviceInfo.packageName;
            String serviceName = info.getResolveInfo().serviceInfo.name;
            if (serviceName != null && serviceName.startsWith(".")) serviceName = packageName + serviceName;
            if (context.getPackageName().equals(packageName) && ReadOnlySyncService.class.getName().equals(serviceName)) return true;
        }
        return false;
    }

    static void begin(Context context, String source, String since) {
        try {
            JSONObject state = new JSONObject();
            state.put("status", "running");
            state.put("source", source);
            state.put("since", since == null ? "" : since);
            state.put("message", "正在打开支付应用，请保持屏幕解锁。遇到验证页面会自动停止。");
            state.put("groups", new JSONArray());
            prefs(context).edit().putString("state", state.toString()).putString("stage", "start")
                .putInt("steps", 0).putInt("scrolls", 0).putInt("empty", 0).putInt("billWait", 0).apply();
        } catch (Exception ignored) {}
    }

    static void stop(Context context, String message, boolean error) {
        try {
            JSONObject state = state(context);
            state.put("status", error ? "error" : "complete");
            state.put("message", message);
            prefs(context).edit().putString("state", state.toString()).apply();
        } catch (Exception ignored) {}
    }

    static void clear(Context context) {
        prefs(context).edit().remove("state").remove("stage").remove("steps").remove("scrolls").remove("empty").remove("billWait").apply();
    }

    static String stateJson(Context context) {
        String value = prefs(context).getString("state", null);
        return value == null ? "{\"status\":\"idle\"}" : value;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject state(Context context) throws Exception {
        return new JSONObject(stateJson(context));
    }

    private boolean running() {
        try { return "running".equals(state(this).optString("status")); }
        catch (Exception e) { return false; }
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!running() || event == null || event.getPackageName() == null) return;
        String source;
        try { source = state(this).optString("source"); }
        catch (Exception e) { return; }
        String expected = "alipay".equals(source) ? ALIPAY : WECHAT;
        if (expected.contentEquals(event.getPackageName())) schedule(350);
    }

    private void inspectCurrentScreen() {
        if (!running()) return;
        long now = System.currentTimeMillis();
        if (now - lastAction < 900) { schedule(900 - (now - lastAction)); return; }
        JSONObject current;
        try { current = state(this); } catch (Exception e) { return; }
        String source = current.optString("source");
        String expected = "alipay".equals(source) ? ALIPAY : WECHAT;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) { schedule(1100); return; }
        if (!expected.equals(String.valueOf(root.getPackageName()))) { root.recycle(); schedule(1100); return; }
        lastAction = now;
        List<String> screen = texts(root, 0, 240);
        String all = String.join(" · ", screen);
        for (String danger : DANGER) {
            if (all.contains(danger)) {
                finish("检测到付款或身份验证页面，已停止且未执行任何操作。", true);
                root.recycle();
                return;
            }
        }
        SharedPreferences p = prefs(this);
        int steps = p.getInt("steps", 0) + 1;
        p.edit().putInt("steps", steps).apply();
        if (steps > 80) {
            finish("页面长时间没有完成同步，已安全停止。可继续使用账单文件导入。", true);
            root.recycle();
            return;
        }
        String stage = p.getString("stage", "start");
        if ("bill".equals(stage)) readBill(root, screen, current);
        else navigate(root, source, stage);
        root.recycle();
        schedule(1100);
    }

    private void navigate(AccessibilityNodeInfo root, String source, String stage) {
        String[] labels;
        String next;
        String message;
        if ("alipay".equals(source)) {
            if ("start".equals(stage)) { labels = new String[]{"我的"}; next = "mine"; message = "正在进入支付宝“我的”。"; }
            else { labels = new String[]{"账单"}; next = "bill"; message = "正在进入支付宝账单。"; }
        } else {
            if ("start".equals(stage)) { labels = new String[]{"我"}; next = "service"; message = "正在进入微信“我”。"; }
            else if ("service".equals(stage)) { labels = new String[]{"服务", "支付与服务"}; next = "wallet"; message = "正在进入微信服务。"; }
            else if ("wallet".equals(stage)) { labels = new String[]{"钱包"}; next = "wechat-bill"; message = "正在进入微信钱包。"; }
            else { labels = new String[]{"账单"}; next = "bill"; message = "正在进入微信账单。"; }
        }
        if (clickUnique(root, labels)) {
            prefs(this).edit().putString("stage", next).apply();
            updateMessage(message);
        }
    }

    private void readBill(AccessibilityNodeInfo root, List<String> screen, JSONObject current) {
        try {
            JSONArray groups = current.optJSONArray("groups");
            if (groups == null) groups = new JSONArray();
            Set<String> known = new HashSet<>();
            for (int i = 0; i < groups.length(); i++) known.add(groups.optJSONObject(i).optString("signature"));
            List<List<String>> found = new ArrayList<>();
            collectGroups(root, found);
            if (found.isEmpty() && groups.length() == 0) {
                int wait = prefs(this).getInt("billWait", 0) + 1;
                prefs(this).edit().putInt("billWait", wait).apply();
                if (wait >= 7) finish("已进入账单入口，但没有读到可识别的金额。请检查支付宝或微信是否显示账单列表。", true);
                return;
            }
            String contextDate = screen.stream().filter(this::looksLikeDate).findFirst().orElse("");
            int added = 0;
            for (List<String> values : found) {
                if (!contextDate.isEmpty() && values.stream().noneMatch(this::looksLikeDate)) values.add(contextDate);
                String signature = String.join("|", values);
                if (signature.length() > 1000) signature = signature.substring(0, 1000);
                if (!known.add(signature) || groups.length() >= 300) continue;
                JSONObject item = new JSONObject();
                item.put("signature", signature);
                item.put("capturedAt", System.currentTimeMillis());
                item.put("texts", new JSONArray(values));
                groups.put(item);
                added++;
            }
            current.put("groups", groups);
            current.put("message", "已读取 " + groups.length() + " 个候选条目，正在查找上次同步日期。请勿点击付款或转账。");
            prefs(this).edit().putString("state", current.toString()).apply();
            String since = current.optString("since");
            if (!since.isEmpty() && containsDate(screen, since)) {
                finish("已读取到上次同步日期并停止，请检查识别结果。", false);
                return;
            }
            int empty = added == 0 ? prefs(this).getInt("empty", 0) + 1 : 0;
            int scrolls = prefs(this).getInt("scrolls", 0);
            prefs(this).edit().putInt("empty", empty).apply();
            if (groups.length() >= 300 || scrolls >= 35 || empty >= 3) {
                finish("账单列表读取完成，请检查识别结果。", false);
                return;
            }
            AccessibilityNodeInfo scrollable = findScrollable(root);
            if (scrollable == null || !scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) {
                finish("已读取当前可见账单，列表无法继续滚动。请检查识别结果。", false);
            } else {
                prefs(this).edit().putInt("scrolls", scrolls + 1).apply();
                scrollable.recycle();
            }
        } catch (Exception e) {
            finish("读取账单时出现异常，已停止且未改变账本。", true);
        }
    }

    private boolean collectGroups(AccessibilityNodeInfo node, List<List<String>> output) {
        boolean childCandidate = false;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                childCandidate |= collectGroups(child, output);
                child.recycle();
            }
        }
        List<String> values = texts(node, 0, 18);
        boolean candidate = values.size() >= 2 && values.size() <= 18 && AMOUNT.matcher(String.join(" ", values)).find();
        if (candidate && !childCandidate) output.add(new ArrayList<>(values));
        return candidate || childCandidate;
    }

    private List<String> texts(AccessibilityNodeInfo node, int depth, int limit) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        collectTexts(node, depth, limit, result);
        return new ArrayList<>(result);
    }

    private void collectTexts(AccessibilityNodeInfo node, int depth, int limit, Set<String> result) {
        if (node == null || depth > 12 || result.size() >= limit) return;
        CharSequence text = node.getText();
        CharSequence desc = node.getContentDescription();
        if (text != null && !text.toString().trim().isEmpty()) result.add(text.toString().trim());
        if (desc != null && !desc.toString().trim().isEmpty()) result.add(desc.toString().trim());
        for (int i = 0; i < node.getChildCount() && result.size() < limit; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) { collectTexts(child, depth + 1, limit, result); child.recycle(); }
        }
    }

    private boolean clickUnique(AccessibilityNodeInfo root, String[] labels) {
        ArrayList<AccessibilityNodeInfo> clickable = new ArrayList<>();
        for (String label : labels) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(label);
            for (AccessibilityNodeInfo node : nodes) {
                if (!label.equals(node.getText() == null ? "" : node.getText().toString().trim())) { node.recycle(); continue; }
                AccessibilityNodeInfo action = AccessibilityNodeInfo.obtain(node);
                while (action != null && !action.isClickable()) {
                    AccessibilityNodeInfo parent = action.getParent();
                    action.recycle();
                    action = parent;
                }
                node.recycle();
                if (action != null) {
                    boolean duplicate = false;
                    for (AccessibilityNodeInfo existing : clickable) duplicate |= existing.equals(action);
                    if (duplicate) action.recycle(); else clickable.add(action);
                }
            }
            if (!clickable.isEmpty()) break;
        }
        if (clickable.size() != 1) { for (AccessibilityNodeInfo n : clickable) n.recycle(); return false; }
        boolean result = clickable.get(0).performAction(AccessibilityNodeInfo.ACTION_CLICK);
        clickable.get(0).recycle();
        return result;
    }

    private AccessibilityNodeInfo findScrollable(AccessibilityNodeInfo node) {
        if (node.isScrollable()) return AccessibilityNodeInfo.obtain(node);
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) continue;
            AccessibilityNodeInfo result = findScrollable(child);
            child.recycle();
            if (result != null) return result;
        }
        return null;
    }

    private boolean looksLikeDate(String value) {
        return value.matches(".*(?:20\\d{2}[年./-]\\d{1,2}[月./-]\\d{1,2}日?|\\d{1,2}月\\d{1,2}日|今天|昨天).*");
    }

    private boolean containsDate(List<String> values, String iso) {
        if (!iso.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
        String y = iso.substring(0,4), m = String.valueOf(Integer.parseInt(iso.substring(5,7))), d = String.valueOf(Integer.parseInt(iso.substring(8,10)));
        String joined = String.join(" ", values);
        return joined.contains(iso) || joined.contains(y + "年" + m + "月" + d + "日") || joined.contains(m + "月" + d + "日");
    }

    private void updateMessage(String message) {
        try { JSONObject value = state(this); value.put("message", message); prefs(this).edit().putString("state", value.toString()).apply(); }
        catch (Exception ignored) {}
    }

    private void finish(String message, boolean error) {
        handler.removeCallbacks(inspect);
        inspectScheduled = false;
        stop(this, message, error);
        Intent intent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try { startActivity(intent); } catch (RuntimeException ignored) {}
    }

    @Override public void onInterrupt() {
        handler.removeCallbacks(inspect);
        inspectScheduled = false;
        if (running()) stop(this, "辅助功能服务被系统中断，账本没有改变。", true);
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(inspect);
        inspectScheduled = false;
        super.onDestroy();
    }
}
