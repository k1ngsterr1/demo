package dev.synthetic.qa;

import android.content.Context;
import android.content.Intent;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Scanner;
import java.util.regex.Pattern;
import org.json.JSONObject;
import org.json.JSONArray;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import androidx.test.uiautomator.StaleObjectException;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class ImportUITest {
  private final UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());

  private UiObject2 find(String text) {
    // An icon-only button may appear after the native sheet animation. Await
    // its accessibility label too, rather than waiting only for visible text.
    UiObject2 value = device.wait(Until.findObject(By.desc(text)), 5000);
    if (value == null) value = device.wait(Until.findObject(By.text(Pattern.compile(Pattern.quote(text), Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE))), 5000);
    if (value == null) {
      File directory = InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
      device.takeScreenshot(new File(directory, "native-qa-failure.png"));
      try { device.dumpWindowHierarchy(new File(directory, "native-qa-failure.xml")); } catch (Exception ignored) {}
    }
    assertNotNull("Missing native control: " + text, value);
    return value;
  }
  private void scrollTo(String text) throws Exception {
    // Search both directions while asynchronous screen transitions settle.
    // Require a usable visible area, not a clipped sliver at the screen edge.
    int minimumHeight = 32;
    for (int step = 0; step < 10; step++) {
      UiObject2 target = device.findObject(By.desc(text));
      if (target == null) target = device.findObject(By.textContains(text));
      if (target != null && target.getVisibleBounds().height() >= minimumHeight) return;
      device.swipe(device.getDisplayWidth()/2, device.getDisplayHeight()/3,
        device.getDisplayWidth()/2, device.getDisplayHeight()*4/5, 20);
      device.waitForIdle();
    }
    for (int attempt = 0; attempt < 8; attempt++) {
      UiObject2 target = device.findObject(By.desc(text));
      if (target == null) target = device.findObject(By.textContains(text));
      if (target != null && target.getVisibleBounds().height() >= minimumHeight) return;
      device.swipe(device.getDisplayWidth()/2, device.getDisplayHeight()*4/5,
        device.getDisplayWidth()/2, device.getDisplayHeight()/3, 30);
      device.waitForIdle();
    }
    File directory = InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
    device.takeScreenshot(new File(directory, "native-qa-failure.png"));
    device.dumpWindowHierarchy(new File(directory, "native-qa-failure.xml"));
    fail("Could not scroll to native control: " + text);
  }
  private void click(String text) {
    for (int attempt = 0; attempt < 3; attempt++) {
      device.waitForIdle();
      try { find(text).click(); return; }
      catch (StaleObjectException error) { if (attempt == 2) throw error; }
    }
  }

  private void openControl(String button, String destination) {
    // A tap can stop an in-flight native scroll/sheet transition. Retry only
    // opening UI, never confirmations that create/delete a server operation.
    Pattern text = Pattern.compile(Pattern.quote(destination),
      Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    for (int attempt = 0; attempt < 3; attempt++) {
      click(button);
      if (device.wait(Until.hasObject(By.desc(destination)), 1000)
          || device.wait(Until.hasObject(By.text(text)), 1000)) return;
    }
    find(destination);
  }
  private JSONObject serverState() throws Exception {
    HttpURLConnection request = (HttpURLConnection) new URL("http://127.0.0.1:8787/__test/state").openConnection();
    request.setConnectTimeout(5000); request.setReadTimeout(5000);
    try (Scanner scanner = new Scanner(request.getInputStream(), "UTF-8").useDelimiter("\\A")) {
      return new JSONObject(scanner.next());
    } finally { request.disconnect(); }
  }
  private JSONObject stats() throws Exception { return serverState().getJSONObject("stats"); }
  private void chooseFixture(String fixture) throws Exception {
    // A first tap can stop scrolling after a settings sheet closes at large
    // font sizes. Wait for the actual picker before searching its documents.
    // Retrying this UI action cannot submit or delete an import.
    BySelector picker = By.pkg("com.google.android.documentsui");
    for (int attempt = 0; attempt < 3; attempt++) {
      scrollTo("Выбрать файл"); click("Выбрать файл");
      if (device.wait(Until.hasObject(picker), 3000)) break;
    }
    assertTrue("Real system document picker opens", device.hasObject(picker));
    // Grid preview buttons can be visible while the filename is below the viewport.
    // Select the document in list view; opening its preview would launch another app.
    UiObject2 list = device.wait(Until.findObject(By.desc("List view")), 2000);
    if (list != null) list.click();
    UiObject2 file = device.wait(Until.findObject(By.text(fixture)), 3000);
    if (file == null) {
      UiObject2 roots = device.wait(Until.findObject(By.desc("Show roots")), 5000);
      assertNotNull("System document picker roots", roots); roots.click();
      click("Downloads");
      file = device.wait(Until.findObject(By.text(fixture)), 10000);
    }
    for (int attempt = 0; file == null && attempt < 3; attempt++) {
      device.swipe(device.getDisplayWidth()/2, device.getDisplayHeight()*4/5,
        device.getDisplayWidth()/2, device.getDisplayHeight()/2, 20);
      file = device.wait(Until.findObject(By.text(fixture)), 2000);
    }
    assertNotNull("Shared synthetic fixture in system picker", file); file.click();
  }

  private Context launchApp() throws Exception {
    // Each scenario starts a fresh release process while preserving its durable journal.
    device.executeShellCommand("am force-stop dev.synthetic.statementimport");
    Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    Intent launch = context.getPackageManager().getLaunchIntentForPackage("dev.synthetic.statementimport");
    assertNotNull(launch);
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
    context.startActivity(launch);
    waitForStartup();
    String expectedWidth = InstrumentationRegistry.getArguments().getString("expectedWidthDp");
    if (expectedWidth != null) {
      assertEquals(Integer.parseInt(expectedWidth), context.getResources().getConfiguration().screenWidthDp);
      assertEquals(2.0f, context.getResources().getConfiguration().fontScale, 0.01f);
    }
    return context;
  }

  private void waitForStartup() {
    // The previous Activity's accessibility tree can briefly survive a launch.
    // Wait through the cold-launch overlay before touching the new Activity.
    BySelector startup = By.desc("Statement Import. Запуск приложения.");
    device.wait(Until.hasObject(startup), 3000);
    assertTrue("Splash screen finishes", device.wait(Until.gone(startup), 10000));
  }

  private void setEndpoint(String endpoint) throws Exception {
    scrollTo("Настройки подключения");
    openControl("Настройки подключения", "Закрыть настройки");
    scrollTo("Адрес локального mock");
    UiObject2 input = find("Адрес локального mock");
    input.click();
    input.setText(endpoint);
    // TextInput.returnKeyType=done and onSubmitEditing use the same save handler.
    device.pressEnter();
    assertTrue(device.wait(Until.gone(By.desc("Закрыть настройки")), 5000));
    openControl("Настройки подключения", "Закрыть настройки");
    scrollTo("Адрес локального mock");
    assertEquals(endpoint, find("Адрес локального mock").getText());
    scrollTo("Закрыть настройки");
    click("Закрыть настройки");
    assertTrue(device.wait(Until.gone(By.desc("Закрыть настройки")), 5000));
  }

  private void assertTemporaryFilesCleared(Context context) throws Exception {
    // The runner is outside the release app's sandbox. This read-only check
    // requires the dedicated userdebug QA emulator; it must never inspect its own cache.
    assertEquals("Private-cache verification requires a userdebug emulator", "0",
      device.executeShellCommand("su 0 id -u").trim());
    String cache = "/data/user/0/dev.synthetic.statementimport/cache";
    String files = device.executeShellCommand("su 0 find " + cache);
    assertTrue("Application cache exists and is readable", files.startsWith(cache + "\n"));
    assertFalse("Cache must be readable", files.contains("Permission denied"));
    assertFalse("Own staging copies cleared", files.contains("/statement-import/"));
    assertFalse("Picker cache cleared", files.contains(cache + "/DocumentPicker"));
  }

  // Run after a separate instrumentation process has created an uncertain import.
  // This also verifies a pending journal survives an APK upgrade without another POST.
  @Test public void recoverExistingImportWithoutResubmission() throws Exception {
    JSONObject before = stats();
    Context context = launchApp();
    if (!device.wait(Until.hasObject(By.text("Регулярные списания")), 10000)) {
      scrollTo("Проверить статус");
      click("Проверить статус");
    }
    scrollTo("151.99");
    assertNotNull(device.wait(Until.findObject(By.textContains("151.99")), 10000));
    assertEquals(before.getInt("createRequests"), stats().getInt("createRequests"));
    scrollTo("Удалить импорт");
    openControl("Удалить импорт", "Удалить");
    click("Удалить");
    assertTrue(device.wait(Until.hasObject(By.text("Импорт удалён")), 20000));
    assertTemporaryFilesCleared(context);
    setEndpoint("http://127.0.0.1:8787");
  }

  @Test public void invalidFilesRejectedBeforePost() throws Exception {
    Context context = launchApp();
    setEndpoint("http://127.0.0.1:8787");
    JSONObject before = stats();
    chooseFixture("spoofed.pdf");
    assertTrue(device.wait(Until.hasObject(By.textContains("Содержимое не соответствует")), 10000));
    assertTemporaryFilesCleared(context);
    chooseFixture("oversize.csv");
    assertTrue(device.wait(Until.hasObject(By.textContains("Файл больше 10 МиБ")), 10000));
    assertTemporaryFilesCleared(context);
    assertEquals(before.getInt("createRequests"), stats().getInt("createRequests"));
    assertEquals(before.getInt("acceptedBytes"), stats().getInt("acceptedBytes"));
  }

  // End this test with a persisted uncertain operation; then stop/relaunch the app
  // and run recoverExistingImportWithoutResubmission in a new test process.
  @Test public void acceptedPostTimeoutKeepsRecoveryAvailable() throws Exception {
    launchApp();
    setEndpoint("http://127.0.0.1:8789");
    JSONObject before = stats();
    chooseFixture("statement.csv");
    scrollTo("Подтвердить и отправить");
    click("Подтвердить и отправить");
    assertNotNull(device.wait(Until.findObject(By.text("Проверяем отправку")), 20000));
    scrollTo("Проверить статус");
    assertNotNull(device.wait(Until.findObject(By.desc("Проверить статус").enabled(true)), 20000));
    assertEquals(before.getInt("createRequests") + 1, stats().getInt("createRequests"));
    assertEquals(before.getInt("newJobs") + 1, stats().getInt("newJobs"));
    assertEquals(before.getInt("acceptedBytes") + 112, stats().getInt("acceptedBytes"));
  }

  @Test public void cancelAcceptedPostClearsFilesAndDeletesServerJob() throws Exception {
    Context context = launchApp();
    setEndpoint("http://127.0.0.1:8789");
    JSONObject before = stats();
    chooseFixture("statement.csv");
    scrollTo("Подтвердить и отправить");
    click("Подтвердить и отправить");
    assertNotNull(device.wait(Until.findObject(By.text("Проверяем отправку")), 20000));
    boolean waitForTimeout = Boolean.parseBoolean(
      InstrumentationRegistry.getArguments().getString("waitForTimeout", "true")
    );
    if (waitForTimeout) {
      scrollTo("Проверить статус");
      UiObject2 check = device.wait(Until.findObject(By.desc("Проверить статус").enabled(true)), 15000);
      // The timeout banner changes content height at large font sizes; reveal
      // the control again before checking its enabled state.
      if (check == null) { scrollTo("Проверить статус"); check = find("Проверить статус"); }
      assertTrue("Deadline releases status checking", check.isEnabled());
    } else {
      assertNotNull("Request is still busy before cancellation",
        device.wait(Until.findObject(By.desc("Проверить статус").enabled(false)), 3000));
    }
    scrollTo("Отменить отправку");
    openControl("Отменить отправку", "Отменить отправку?");
    assertNotNull(device.wait(Until.findObject(By.text("Отменить отправку?")), 5000));
    // Choose the Android confirmation-dialog button, not the underlying app button.
    UiObject2 confirm = device.wait(Until.findObject(By.res("android:id/button1")), 5000);
    assertNotNull(confirm);
    confirm.click();
    assertTrue(device.wait(Until.hasObject(By.desc("Добавьте выписку")), 10000));
    assertTemporaryFilesCleared(context);
    long deadline = android.os.SystemClock.elapsedRealtime() + 20000;
    JSONObject after = stats();
    while (after.getInt("deleteRequests") == before.getInt("deleteRequests")
        && android.os.SystemClock.elapsedRealtime() < deadline) {
      android.os.SystemClock.sleep(250);
      after = stats();
    }
    assertEquals(before.getInt("createRequests") + 1, after.getInt("createRequests"));
    assertEquals(before.getInt("newJobs") + 1, after.getInt("newJobs"));
    assertEquals(before.getInt("acceptedBytes") + 112, after.getInt("acceptedBytes"));
    assertEquals(before.getInt("deleteRequests") + 1, after.getInt("deleteRequests"));
    // Final status=deleted is additionally captured from the host mock evidence.
    setEndpoint("http://127.0.0.1:8787");
  }


  @Test public void backgroundCancellationFailureStaysQuietAndRecoversOnRelaunch() throws Exception {
    mode("lost_ack");
    Context context = launchApp();
    setEndpoint("http://127.0.0.1:8787");
    JSONObject before = stats();
    chooseFixture("statement.csv");
    scrollTo("Подтвердить и отправить"); click("Подтвердить и отправить");
    assertNotNull(device.wait(Until.findObject(By.text("Проверяем отправку")), 10000));
    scrollTo("Отменить отправку");
    mode("delete_failure");
    openControl("Отменить отправку", "Отменить отправку?");
    UiObject2 confirm = device.wait(Until.findObject(By.res("android:id/button1")), 5000);
    assertNotNull(confirm); confirm.click();
    assertTrue(device.wait(Until.hasObject(By.desc("Добавьте выписку")), 10000));
    assertTemporaryFilesCleared(context);

    // Wait until the automatic background DELETE really failed, then stay on
    // Home beyond the old delayed-notice window. No journal/queue is seeded.
    long deadline = android.os.SystemClock.elapsedRealtime() + 20000;
    while (stats().getInt("deleteRequests") == before.getInt("deleteRequests")
        && android.os.SystemClock.elapsedRealtime() < deadline) {
      android.os.SystemClock.sleep(250);
    }
    assertEquals(before.getInt("deleteRequests") + 1, stats().getInt("deleteRequests"));
    android.os.SystemClock.sleep(15000);
    assertFalse(device.hasObject(By.text("Не удалось подтвердить удаление. Повторите попытку.")));
    assertFalse(device.hasObject(By.text("Проверка не завершилась. Попробуйте ещё раз.")));
    assertFalse(device.hasObject(By.desc("Проверить удаления")));
    scrollTo("Выбрать файл"); assertTrue(find("Выбрать файл").isEnabled());
    snapshot("quiet-home-after-background-deletion-failure");

    scrollTo("Настройки подключения");
    openControl("Настройки подключения", "Закрыть настройки");
    scrollTo("Сохранить адрес");
    for (int attempt = 0; attempt < 4; attempt++) {
      assertFalse(device.hasObject(By.text("Незавершённые удаления")));
      assertFalse(device.hasObject(By.desc("Проверить удаления")));
      assertFalse(device.hasObject(By.text("Проверка не завершилась. Попробуйте ещё раз.")));
      device.swipe(device.getDisplayWidth()/2, device.getDisplayHeight()*4/5,
        device.getDisplayWidth()/2, device.getDisplayHeight()/3, 20);
      device.waitForIdle();
    }
    snapshot("settings-without-background-deletion-controls");

    mode("happy"); launchApp();
    deadline = android.os.SystemClock.elapsedRealtime() + 20000;
    boolean deleted = false;
    while (!deleted && android.os.SystemClock.elapsedRealtime() < deadline) {
      JSONArray jobs = serverState().getJSONArray("jobs");
      deleted = "deleted".equals(jobs.getJSONObject(jobs.length() - 1).getString("status"));
      if (!deleted) android.os.SystemClock.sleep(250);
    }
    assertTrue("Relaunch automatically completes the saved cancellation", deleted);
    scrollTo("Выбрать файл"); assertTrue(find("Выбрать файл").isEnabled());
    assertEquals(before.getInt("createRequests") + 1, stats().getInt("createRequests"));
    assertEquals(before.getInt("newJobs") + 1, stats().getInt("newJobs"));
    assertEquals(before.getInt("deleteRequests") + 2, stats().getInt("deleteRequests"));
    snapshot("pending-deletion-recovered-without-settings-controls");
  }

  private void mode(String mode) throws Exception {
    HttpURLConnection request = (HttpURLConnection) new URL("http://127.0.0.1:8787/__test/scenario").openConnection();
    request.setRequestMethod("POST");
    request.setConnectTimeout(5000); request.setReadTimeout(5000);
    request.setRequestProperty("Content-Type", "application/json");
    request.setDoOutput(true);
    try {
      try (java.io.OutputStream body = request.getOutputStream()) {
        body.write(new JSONObject().put("mode", mode).toString().getBytes(StandardCharsets.UTF_8));
      }
      assertEquals(200, request.getResponseCode());
    } finally { request.disconnect(); }
  }

  private void snapshot(String name) throws Exception {
    File directory = InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
    device.takeScreenshot(new File(directory, name + ".png"));
    device.dumpWindowHierarchy(new File(directory, name + ".xml"));
    try (FileOutputStream output = new FileOutputStream(new File(directory, name + "-counters.json"))) {
      output.write(stats().toString(2).getBytes(StandardCharsets.UTF_8));
    }
  }

  private void deleteAndVerify(Context context, String action) throws Exception {
    scrollTo(action); openControl(action, "Удалить"); click("Удалить");
    assertTrue(device.wait(Until.hasObject(By.text("Импорт удалён")), 20000));
    assertTemporaryFilesCleared(context);
  }

  @Test public void lostAckRelaunchKeepsOneJob() throws Exception {
    mode("lost_ack");
    Context context = launchApp();
    setEndpoint("http://127.0.0.1:8787");
    JSONObject before = stats(); snapshot("lost-ack-before");
    chooseFixture("statement.csv");
    scrollTo("Подтвердить и отправить"); click("Подтвердить и отправить");
    assertTrue(device.wait(Until.hasObject(By.text("Нужно внимание")), 20000));
    snapshot("lost-ack-uncertain");
    launchApp();
    scrollTo("151.99");
    assertNotNull(device.wait(Until.findObject(By.textContains("151.99")), 20000));
    assertEquals(before.getInt("newJobs") + 1, stats().getInt("newJobs"));
    assertEquals(before.getInt("createRequests") + 1, stats().getInt("createRequests"));
    scrollTo("Статус импорта, ready · revision 3");
    assertNotNull(find("Статус импорта, ready · revision 3"));
    scrollTo("Подробнее: StreamBeam"); assertNotNull(find("Подробнее: StreamBeam"));
    snapshot("lost-ack-recovered");
    mode("happy"); deleteAndVerify(context, "Удалить импорт");
  }

  @Test public void staleStatusAndFailedDeletionKeepTruthfulUI() throws Exception {
    mode("stale_status");
    Context context = launchApp();
    JSONObject before = stats(); snapshot("stale-before");
    chooseFixture("statement.pdf");
    scrollTo("Подтвердить и отправить"); click("Подтвердить и отправить");
    scrollTo("151.99");
    assertNotNull(device.wait(Until.findObject(By.textContains("151.99")), 20000));
    scrollTo("Проверить статус"); click("Проверить статус");
    scrollTo("Статус импорта, ready · revision 3");
    assertNotNull(device.wait(Until.findObject(By.desc("Статус импорта, ready · revision 3")), 5000));
    snapshot("stale-still-ready-3");
    mode("delete_failure");
    scrollTo("Удалить импорт"); openControl("Удалить импорт", "Удалить"); click("Удалить");
    assertTrue(device.wait(Until.hasObject(By.text("Удаление не подтверждено")), 15000));
    assertFalse(device.hasObject(By.text("Импорт удалён")));
    scrollTo("Повторить удаление");
    assertTrue(find("Повторить удаление").isEnabled());
    snapshot("delete-503-unconfirmed");
    mode("happy"); deleteAndVerify(context, "Повторить удаление");
    assertEquals(before.getInt("newJobs") + 1, stats().getInt("newJobs"));
    assertEquals(before.getInt("createRequests") + 1, stats().getInt("createRequests"));
    snapshot("delete-retry-confirmed");
  }

  @Test public void nativePickerRawImportDetailsAndDeletion() throws Exception {
    Context context = launchApp();
    Intent launch = context.getPackageManager().getLaunchIntentForPackage("dev.synthetic.statementimport");
    assertNotNull(launch);
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    if (device.wait(Until.hasObject(By.text("Проверьте файл")), 3000)) {
      scrollTo("Отменить выбор"); click("Отменить выбор");
    }
    // A previous interrupted run may have left its synthetic job ready. Complete
    // its real deletion in the UI before starting a distinct import.
    if (device.wait(Until.hasObject(By.text("Регулярные списания")), 3000)) {
      scrollTo("Удалить импорт"); openControl("Удалить импорт", "Удалить"); click("Удалить");
      scrollTo("Импорт удалён");
      assertNotNull(device.wait(Until.findObject(By.text("Импорт удалён")), 20000));
    }
    JSONObject before = stats();
    String fixture = InstrumentationRegistry.getArguments().getString("fixture", "statement.csv");
    int expectedBytes = Integer.parseInt(InstrumentationRegistry.getArguments().getString("expectedBytes", "112"));
    click("Настройки подключения");
    assertNotNull(find("Закрыть настройки"));
    device.pressBack();
    assertTrue(device.wait(Until.gone(By.desc("Закрыть настройки")), 5000));
    chooseFixture(fixture);
    assertNotNull(device.wait(Until.findObject(By.text("Проверьте файл")), 10000));
    scrollTo("Отменить выбор"); click("Отменить выбор");
    assertNotNull(device.wait(Until.findObject(By.desc("Добавьте выписку")), 10000));
    scrollTo("Выбрать файл");
    assertNotNull(device.wait(Until.findObject(By.text("Выбрать файл")), 10000));
    assertEquals(before.getInt("createRequests"), stats().getInt("createRequests"));
    chooseFixture(fixture);
    scrollTo("Подтвердить и отправить"); click("Подтвердить и отправить");
    scrollTo("151.99");
    assertNotNull(device.wait(Until.findObject(By.textContains("151.99")), 20000));
    device.takeScreenshot(new File(context.getExternalFilesDir(null), "native-qa-ready.png"));
    // Root Back may background the app; resuming/recreating the activity restores the report.
    device.pressBack(); context.startActivity(launch);
    waitForStartup();
    assertNotNull(device.wait(Until.findObject(By.text("Регулярные списания")), 10000));
    scrollTo("151.99");
    assertNotNull(device.wait(Until.findObject(By.textContains("151.99")), 20000));
    scrollTo("Подробнее: StreamBeam"); openControl("Подробнее: StreamBeam", "Закрыть подробности");
    assertNotNull(find("Закрыть подробности")); device.pressBack();
    assertTrue(device.wait(Until.gone(By.desc("Закрыть подробности")), 5000));
    device.waitForWindowUpdate("dev.synthetic.statementimport", 1500);
    scrollTo("Удалить импорт"); openControl("Удалить импорт", "Удалить");
    device.takeScreenshot(new File(context.getExternalFilesDir(null), "native-qa-delete-dialog.png"));
    click("Удалить");
    scrollTo("Импорт удалён");
    assertNotNull(device.wait(Until.findObject(By.text("Импорт удалён")), 20000));
    device.takeScreenshot(new File(context.getExternalFilesDir(null), "native-qa-deleted.png"));
    assertTemporaryFilesCleared(context);
    JSONObject after = stats();
    assertEquals(before.getInt("newJobs") + 1, after.getInt("newJobs"));
    assertEquals(before.getInt("createRequests") + 1, after.getInt("createRequests"));
    assertEquals(before.getInt("deleteRequests") + 1, after.getInt("deleteRequests"));
    assertEquals(before.getInt("acceptedBytes") + expectedBytes, after.getInt("acceptedBytes"));
    JSONObject evidence = new JSONObject().put("before", before).put("after", after)
      .put("expectedBytes", expectedBytes).put("stagingFiles", 0).put("pickerCacheFiles", 0);
    try (FileOutputStream output = new FileOutputStream(new File(context.getExternalFilesDir(null), "native-qa-counters.json"))) {
      output.write(evidence.toString(2).getBytes(StandardCharsets.UTF_8));
    }
  }

  private JSONObject qaControl(String path, String mode) throws Exception {
    HttpURLConnection request = (HttpURLConnection) new URL("http://127.0.0.1:8991" + path).openConnection();
    request.setConnectTimeout(5000); request.setReadTimeout(5000);
    if (mode != null) {
      request.setRequestMethod("POST"); request.setDoOutput(true);
      request.setRequestProperty("Content-Type", "application/json");
      try (java.io.OutputStream output = request.getOutputStream()) {
        output.write(new JSONObject().put("mode", mode).toString().getBytes(StandardCharsets.UTF_8));
      }
    }
    try (Scanner scanner = new Scanner(request.getInputStream(), "UTF-8").useDelimiter("\\A")) {
      return new JSONObject(scanner.next());
    } finally { request.disconnect(); }
  }

  private JSONArray qaAttempts(String mode, String method) throws Exception {
    JSONArray all = qaControl("/__qa/state", null).getJSONArray("events");
    JSONArray matches = new JSONArray();
    for (int index = 0; index < all.length(); index++) {
      JSONObject event = all.getJSONObject(index);
      if (mode.equals(event.optString("mode")) && method.equals(event.optString("method"))) matches.put(event);
    }
    return matches;
  }

  private void assertRawCSVRequests(String mode) throws Exception {
    JSONArray posts = qaAttempts(mode, "POST");
    assertTrue(posts.length() > 0);
    for (int index = 0; index < posts.length(); index++) {
      JSONObject post = posts.getJSONObject(index);
      assertEquals("Actual native HTTP Content-Type", "application/octet-stream", post.getString("contentType"));
      assertEquals(112, post.getInt("bytes"));
      assertTrue(post.getBoolean("filenameHeaderPresent"));
      assertEquals("2d2eb2233378820aeeecfc3a5d54d1ecb5a0e48eaa1e672478acaa3822890c7c", post.getString("sha256"));
      assertEquals(64, post.getString("keyHash").length());
    }
  }

  @Test public void httpProgressErrorAndStableDeletionKey() throws Exception {
    mode("happy"); qaControl("/__qa/mode", "progress");
    Context context = launchApp(); setEndpoint("http://127.0.0.1:8991");
    JSONObject before = stats();
    chooseFixture("statement.csv"); scrollTo("Подтвердить и отправить"); click("Подтвердить и отправить");
    assertTrue(device.wait(Until.hasObject(By.text("Импорт в очереди")), 8000));
    assertFalse(device.hasObject(By.text("Регулярные списания"))); snapshot("http-queued-no-report");
    assertTrue(device.wait(Until.hasObject(By.text("Обрабатываем выписку")), 10000));
    assertFalse(device.hasObject(By.text("Регулярные списания"))); snapshot("http-processing-no-report");
    assertTrue(device.wait(Until.hasObject(By.text("Регулярные списания")), 20000));
    String[][] items = {{"StreamBeam", "01.10.2026"}, {"BrightGrid", "03.10.2026"}};
    for (String[] item : items) {
      scrollTo("Подробнее: " + item[0]); openControl("Подробнее: " + item[0], "Закрыть подробности");
      scrollTo(item[1]); assertNotNull(find(item[1])); snapshot("details-" + item[0]);
      scrollTo("Закрыть подробности"); click("Закрыть подробности");
    }
    scrollTo("Удалить импорт"); openControl("Удалить импорт", "Удалить"); click("Удалить");
    assertTrue(device.wait(Until.hasObject(By.text("Удаляем импорт")), 5000));
    assertFalse(device.hasObject(By.text("Импорт удалён"))); snapshot("http-deleting-not-deleted");
    assertTrue(device.wait(Until.hasObject(By.text("Импорт удалён")), 20000));

    qaControl("/__qa/mode", "error");
    chooseFixture("statement.csv"); scrollTo("Подтвердить и отправить"); click("Подтвердить и отправить");
    assertTrue(device.wait(Until.hasObject(By.text("Ошибка обработки")), 15000));
    assertFalse("Server error stops spinner", device.hasObject(By.clazz("android.widget.ProgressBar")));
    scrollTo("Проверить статус"); assertTrue(find("Проверить статус").isEnabled());
    snapshot("http-server-error-actions-available");
    mode("delete_failure"); scrollTo("Удалить импорт"); openControl("Удалить импорт", "Удалить"); click("Удалить");
    assertTrue(device.wait(Until.hasObject(By.text("Удаление не подтверждено")), 10000));
    assertFalse(device.hasObject(By.text("Импорт удалён")));
    mode("happy"); deleteAndVerify(context, "Повторить удаление");
    JSONArray attempts = qaAttempts("error", "DELETE");
    assertEquals(2, attempts.length());
    assertEquals(attempts.getJSONObject(0).getString("keyHash"), attempts.getJSONObject(1).getString("keyHash"));
    assertEquals(before.getInt("createRequests") + 2, stats().getInt("createRequests"));
    assertEquals(before.getInt("newJobs") + 2, stats().getInt("newJobs"));
    assertRawCSVRequests("error");
    setEndpoint("http://127.0.0.1:8787");
  }

  @Test public void http404RetryAndMalformedResponseRecovery() throws Exception {
    mode("happy"); qaControl("/__qa/mode", "drop-first-post");
    Context context = launchApp(); setEndpoint("http://127.0.0.1:8991");
    JSONObject before = stats();
    chooseFixture("statement.csv"); scrollTo("Подтвердить и отправить"); click("Подтвердить и отправить");
    assertTrue(device.wait(Until.hasObject(By.text("Нужно внимание")), 15000));
    assertEquals(before.getInt("createRequests"), stats().getInt("createRequests"));
    launchApp(); assertTrue(device.wait(Until.hasObject(By.text("Нужно внимание")), 15000));
    scrollTo("Проверить статус"); click("Проверить статус");
    assertEquals(before.getInt("createRequests"), stats().getInt("createRequests"));
    snapshot("http-404-keeps-explicit-retry");
    scrollTo("Восстановить / повторить с тем же ключом"); click("Восстановить / повторить с тем же ключом");
    assertTrue(device.wait(Until.hasObject(By.text("Регулярные списания")), 20000));
    JSONArray attempts = qaAttempts("drop-first-post", "POST");
    assertEquals(2, attempts.length());
    assertRawCSVRequests("drop-first-post");
    assertEquals(attempts.getJSONObject(0).getString("keyHash"), attempts.getJSONObject(1).getString("keyHash"));
    assertEquals(attempts.getJSONObject(0).getString("sha256"), attempts.getJSONObject(1).getString("sha256"));
    assertEquals(before.getInt("newJobs") + 1, stats().getInt("newJobs"));
    deleteAndVerify(context, "Удалить импорт");

    qaControl("/__qa/mode", "malformed-create");
    chooseFixture("statement.csv"); scrollTo("Подтвердить и отправить"); click("Подтвердить и отправить");
    assertTrue(device.wait(Until.hasObject(By.textContains("Сервер вернул неожиданный ответ")), 10000));
    scrollTo("Проверить статус"); assertTrue(find("Проверить статус").isEnabled());
    snapshot("http-malformed-response-recoverable"); click("Проверить статус");
    assertTrue(device.wait(Until.hasObject(By.text("Регулярные списания")), 20000));
    assertEquals(before.getInt("createRequests") + 2, stats().getInt("createRequests"));
    assertEquals(before.getInt("newJobs") + 2, stats().getInt("newJobs"));
    assertRawCSVRequests("malformed-create");
    deleteAndVerify(context, "Удалить импорт"); setEndpoint("http://127.0.0.1:8787");
  }
}
