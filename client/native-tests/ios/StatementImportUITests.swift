import XCTest

@MainActor
final class StatementImportUITests: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "dev.synthetic.statementimport")

  func element(_ label: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
  }
  func capture(_ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
  func tap(_ label: String) {
    let target = element(label)
    XCTAssertTrue(target.waitForExistence(timeout: 10), "Missing element: \(label)")
    scrollTo(target)
    target.tap()
  }
  func control(_ path: String, mode: String? = nil, port: Int = 8787) -> [String: Any] {
    var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)" + path)!)
    if let mode {
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try! JSONSerialization.data(withJSONObject: ["mode": mode])
    }
    request.timeoutInterval = 10
    let completed = expectation(description: "Local mock response")
    var result: [String: Any] = [:]
    URLSession.shared.dataTask(with: request) { data, response, error in
      XCTAssertNil(error)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
      if let data { result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:] }
      completed.fulfill()
    }.resume()
    wait(for: [completed], timeout: 15)
    return result
  }
  func enterURL(_ value: String) {
    let field = app.textFields["Адрес локального mock"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    scrollTo(field)
    // Select the whole single-line URL. A double tap may already select the
    // entire address, in which case iOS omits the "Select All" menu item.
    field.tap(withNumberOfTaps: 3, numberOfTouches: 1)
    field.typeText(value)
    XCTAssertEqual(field.value as? String, value, "Test must replace the entire endpoint")
  }
  func saveSettings() {
    let done = app.keyboards.buttons["Done"]
    if done.exists { done.tap() } else { tap("Сохранить адрес") }
  }
  func stats() -> [String: Int] { control("/__test/state")["stats"] as! [String: Int] }
  func mode(_ value: String) { _ = control("/__test/scenario", mode: value) }
  func launch() { continueAfterFailure = false; app.terminate(); app.launch() }
  func scrollTo(_ target: XCUIElement) {
    XCTAssertTrue(target.waitForExistence(timeout: 10), "Destination control must exist before scrolling")
    for _ in 0..<24 {
      if target.isHittable { return }
      if target.exists && target.frame.midY < app.frame.midY {
        app.swipeDown()
      } else {
        app.swipeUp()
      }
    }
    XCTAssertTrue(target.isHittable, "Control must remain reachable by scrolling: \(target.label)")
  }
  func pick(_ identifier: String) {
    let choose = app.buttons["Выбрать файл"]
    scrollTo(choose)
    // A tap can finish deceleration rather than activate a control. Retry only
    // opening the picker, never POST or deletion confirmations.
    for _ in 0..<3 {
      tap("Выбрать файл")
      if element("Browse").waitForExistence(timeout: 3) { break }
    }
    XCTAssertTrue(element("Browse").exists, "Real document picker must open before selecting a fixture")
    chooseInPicker(identifier)
  }
  func chooseInPicker(_ identifier: String) {
    // A list exposes the full filename on a narrow screen at accessibility sizes.
    // This is a real system picker preference, not a replacement file source.
    let more = app.buttons["More"].firstMatch
    XCTAssertTrue(more.waitForExistence(timeout: 5)); more.tap()
    let list = element("List")
    XCTAssertTrue(list.waitForExistence(timeout: 5)); list.tap()
    let file = app.cells[identifier]
    func reveal(_ target: XCUIElement, anchor: CGFloat = 0.5) -> Bool {
      let top = app.navigationBars.firstMatch.frame.maxY + 8
      let bottom = app.tabBars.firstMatch.frame.minY - 8
      func visible() -> Bool {
        target.exists && target.isHittable && target.frame.minY + target.frame.height * anchor > top && target.frame.minY + target.frame.height * anchor < bottom
      }
      func scroll(up: Bool) {
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let start = origin.withOffset(CGVector(dx: app.frame.width / 2, dy: top + (bottom - top) * (up ? 0.8 : 0.2)))
        let end = origin.withOffset(CGVector(dx: app.frame.width / 2, dy: top + (bottom - top) * (up ? 0.2 : 0.8)))
        start.press(forDuration: 0.05, thenDragTo: end)
      }
      for _ in 0..<10 {
        if visible() { return true }
        scroll(up: !(target.exists && target.frame.minY + target.frame.height * anchor < top))
      }
      for _ in 0..<10 {
        if visible() { return true }
        scroll(up: false)
      }
      return visible()
    }
    if !reveal(file, anchor: 0.5) {
      let browse = element("Browse")
      XCTAssertTrue(browse.waitForExistence(timeout: 10)); browse.tap()
      let local = element("On My iPhone")
      XCTAssertTrue(reveal(local), "Local Files location must be reachable")
      local.tap()
      let folder = app.cells.matching(NSPredicate(format: "label BEGINSWITH %@", "Statement QA,")).firstMatch
      XCTAssertTrue(reveal(folder, anchor: 0.5), "Synthetic fixture folder must be reachable")
      folder.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    }
    XCTAssertTrue(reveal(file, anchor: 0.5), "Synthetic fixture must be reachable in the real system picker")
    for _ in 0..<3 {
      file.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
      let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: file)
      if XCTWaiter.wait(for: [dismissed], timeout: 3) == .completed { return }
    }
    XCTFail("Selecting the system document must dismiss the picker")
  }
  func ready() {
    let total = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "151.99")).firstMatch
    XCTAssertTrue(total.waitForExistence(timeout: 20))
  }
  func deleteRequest(_ label: String = "Удалить импорт") {
    let button = app.buttons[label]; scrollTo(button); button.tap()
    app.alerts.buttons["Удалить"].tap()
  }
  func deleted() { XCTAssertTrue(element("Импорт удалён").waitForExistence(timeout: 20)) }
  func test01NativePickerAndImport() {
    mode("happy"); launch()
    capture("empty-import")
    tap("Настройки подключения"); capture("connection-settings"); tap("Закрыть настройки")
    pick("statement, csv")
    XCTAssertTrue(element("Проверьте файл").waitForExistence(timeout: 10))
    capture("file-confirmation")
    tap("Настройки подключения")
    enterURL("https://example.com")
    saveSettings()
    XCTAssertTrue(element("Укажите http://localhost:8787 или явно выбранный частный LAN IPv4-адрес.").waitForExistence(timeout: 5))
    enterURL("http://127.0.0.1:8788")
    saveSettings()
    // The next-import setting must not redirect an already selected operation.
    tap("Подтвердить и отправить")
    ready()
    capture("ready-report")
    tap("Настройки подключения")
    enterURL("http://127.0.0.1:8787")
    saveSettings()
    let details = app.buttons["Подробнее: StreamBeam"]
    for _ in 0..<5 { if details.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(details.exists)
    details.tap()
    capture("subscription-details")
    tap("Закрыть подробности")
    deleteRequest(); deleted()
    capture("confirmed-deleted")
  }
  func test02LostAckAndRelaunch() {
    mode("lost_ack"); let before = stats(); launch()
    pick("statement, csv"); tap("Подтвердить и отправить")
    XCTAssertTrue(element("Нужно внимание").waitForExistence(timeout: 20))
    capture("lost-ack-unknown")
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 1)
    launch(); ready(); capture("lost-ack-recovered-after-relaunch")
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 1)
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 1)
    mode("happy"); deleteRequest(); deleted()
  }
  func test03PDFStaleStatusAndDeleteFailure() {
    mode("stale_status"); launch(); pick("statement, pdf")
    tap("Подтвердить и отправить"); ready()
    tap("Проверить статус")
    let status = app.descendants(matching: .any)["import-status"]
    XCTAssertTrue(status.waitForExistence(timeout: 10))
    XCTAssertEqual(status.value as? String, "ready · revision 3")
    ready(); capture("stale-status-still-ready-3")
    mode("delete_failure"); deleteRequest()
    XCTAssertTrue(element("Удаление не подтверждено").waitForExistence(timeout: 10))
    XCTAssertFalse(element("Импорт удалён").exists)
    capture("delete-503-unconfirmed")
    mode("happy"); deleteRequest("Повторить удаление"); deleted()
    capture("delete-retry-confirmed")
  }
  func test04BadFilesBeforePOST() {
    mode("happy"); let before = stats(); launch()
    pick("spoofed, pdf")
    XCTAssertTrue(element("Содержимое не соответствует PDF или CSV из набора. Файл не отправлен.").waitForExistence(timeout: 10))
    capture("spoofed-rejected")
    pick("oversize, csv")
    XCTAssertTrue(element("Файл больше 10 МиБ. Выберите выписку меньшего размера.").waitForExistence(timeout: 10))
    capture("oversize-rejected")
    XCTAssertEqual(stats()["createRequests"], before["createRequests"])
  }
  func test05LargeFontSelectionAndCancel() {
    app.launchArguments = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    defer { app.launchArguments = [] }
    mode("happy"); let before = stats(); launch()
    XCTAssertLessThanOrEqual(app.frame.width, 375, "Run this acceptance test on iPhone SE or another small viewport")
    let choose = app.buttons["Выбрать файл"]
    XCTAssertTrue(choose.waitForExistence(timeout: 10))
    capture("max-font-small-home")
    scrollTo(choose)
    XCTAssertGreaterThan(choose.frame.height, 60, "Dynamic Type must actually enlarge the control")
    tap("Настройки подключения")
    capture("max-font-small-settings")
    saveSettings()
    pick("statement, csv")
    capture("max-font-small-confirmation")
    tap("Отменить выбор")
    XCTAssertEqual(stats()["createRequests"], before["createRequests"])
    pick("statement, csv")
    tap("Назад к выбору файла")
    XCTAssertEqual(stats()["createRequests"], before["createRequests"])
    pick("statement, csv")
    tap("Подтвердить и отправить"); ready()
    capture("max-font-small-report")
    tap("Подробнее: StreamBeam")
    capture("max-font-small-details")
    scrollTo(element("01.10.2026"))
    XCTAssertTrue(element("01.10.2026").isHittable)
    tap("Закрыть подробности")
    deleteRequest(); deleted()
    capture("max-font-small-deleted")
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 1)
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 1)
    XCTAssertEqual(stats()["acceptedBytes"], before["acceptedBytes"]! + 112)
    // Lost ACK exposes the recovery and cancellation actions at the same size.
    mode("lost_ack")
    pick("statement, csv"); tap("Подтвердить и отправить")
    XCTAssertTrue(element("Нужно внимание").waitForExistence(timeout: 20))
    scrollTo(app.buttons["Проверить статус"])
    XCTAssertTrue(app.buttons["Проверить статус"].isEnabled)
    scrollTo(app.buttons["Восстановить / повторить с тем же ключом"])
    XCTAssertTrue(app.buttons["Восстановить / повторить с тем же ключом"].isEnabled)
    capture("max-font-small-recovery-actions")
    tap("Отменить отправку")
    app.alerts.buttons["Отменить отправку"].tap()
    XCTAssertTrue(app.buttons["Выбрать файл"].waitForExistence(timeout: 10))
    mode("happy")
    for _ in 0..<10 {
      let jobs = control("/__test/state")["jobs"] as! [[String: Any]]
      if jobs.last?["status"] as? String == "deleted" { break }
      Thread.sleep(forTimeInterval: 1)
    }
    let jobs = control("/__test/state")["jobs"] as! [[String: Any]]
    XCTAssertEqual(jobs.last?["status"] as? String, "deleted")
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 2)
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 2)
    capture("max-font-small-cancelled")
  }
  func test06StackRestoresConfirmationAndBackCleansSelection() {
    mode("happy"); let before = stats(); launch()
    pick("statement, csv")
    XCTAssertTrue(element("Проверьте файл").waitForExistence(timeout: 10))
    // A restored confirmation is the same staged operation, without another picker or POST.
    launch()
    XCTAssertTrue(element("Проверьте файл").waitForExistence(timeout: 10))
    tap("Настройки подключения"); tap("Закрыть настройки")
    tap("Назад к выбору файла")
    XCTAssertTrue(app.buttons["Выбрать файл"].waitForExistence(timeout: 10))
    XCTAssertEqual(stats()["createRequests"], before["createRequests"])
    launch()
    XCTAssertTrue(app.buttons["Выбрать файл"].waitForExistence(timeout: 10))
    capture("stack-back-cancelled")
  }
  // Run separately after scripts/seed-ios-recovery.mjs prepares the dedicated QA app.
  func test07RelocatedLegacyCacheSurvivesBootAndUploads() {
    mode("happy"); let before = stats(); launch()
    XCTAssertTrue(element("Проверьте файл").waitForExistence(timeout: 10))
    XCTAssertFalse(element("Нужно внимание").exists)
    tap("Подтвердить и отправить"); ready()
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 1)
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 1)
    XCTAssertEqual(stats()["acceptedBytes"], before["acceptedBytes"]! + 112)
    capture("relocated-cache-ready")
    deleteRequest(); deleted()
  }
  func test08MissingSelectedCopyCanBeReselectedAndCancelledWithoutPOST() {
    mode("happy"); let before = stats(); launch()
    XCTAssertTrue(element("Временная копия недоступна. Выберите файл заново или отмените выбор.").waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["Подтвердить и отправить"].exists)
    XCTAssertFalse(element("Готов к отправке").exists)
    capture("missing-copy-reselection")
    tap("Выбрать файл заново"); chooseInPicker("statement, csv")
    XCTAssertTrue(element("Готов к отправке").waitForExistence(timeout: 10))
    tap("Отменить выбор")
    XCTAssertTrue(app.buttons["Выбрать файл"].waitForExistence(timeout: 10))
    XCTAssertEqual(stats()["createRequests"], before["createRequests"])
    capture("missing-copy-cancelled")
  }
  // Run with the dedicated loopback QA proxy, never the user's LAN mock.
  func checkRequestDeadline(port: Int, stage: String) {
    mode("happy"); let before = stats(); launch()
    tap("Настройки подключения"); enterURL("http://127.0.0.1:\(port)")
    saveSettings()
    pick("statement, csv"); tap("Подтвердить и отправить")
    XCTAssertTrue(element("Сервер не ответил вовремя. Проверьте подключение и восстановите статус.").waitForExistence(timeout: 18))
    XCTAssertTrue(app.buttons["Проверить статус"].isEnabled)
    XCTAssertTrue(app.buttons["Восстановить / повторить с тем же ключом"].isEnabled)
    capture("request-timeout-" + stage)
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 1)
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 1)
    XCTAssertEqual(stats()["acceptedBytes"], before["acceptedBytes"]! + 112)
    tap("Проверить статус"); ready()
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 1)
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 1)
    capture("request-timeout-" + stage + "-recovered")
    deleteRequest(); deleted()
    tap("Настройки подключения"); enterURL("http://127.0.0.1:8787")
    saveSettings()
  }
  func test09PendingHeadersReleasesUIAndRecoversWithoutSecondPOST() {
    checkRequestDeadline(port: 8789, stage: "headers")
  }
  func test10PendingBodyReleasesUIAndRecoversWithoutSecondPOST() {
    checkRequestDeadline(port: 8790, stage: "body")
  }
  // Dedicated Simulator and synthetic fixture only. Never use against the user's operation.
  func checkCancellation(port: Int, afterTimeout: Bool) {
    mode("happy"); let before = stats(); launch()
    tap("Настройки подключения"); enterURL("http://127.0.0.1:\(port)")
    saveSettings()
    pick("statement, csv"); tap("Подтвердить и отправить")
    let cancel = app.buttons["Отменить отправку"]
    XCTAssertTrue(cancel.waitForExistence(timeout: 5)); XCTAssertTrue(cancel.isEnabled)
    if afterTimeout {
      XCTAssertTrue(element("Нужно внимание").waitForExistence(timeout: 18))
    } else {
      XCTAssertFalse(app.buttons["Проверить статус"].isEnabled, "Cancel must work while request is busy")
    }
    capture(afterTimeout ? "cancel-after-timeout" : "cancel-during-request")
    scrollTo(cancel); cancel.tap(); app.alerts.buttons["Отменить отправку"].tap()
    XCTAssertTrue(app.buttons["Выбрать файл"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Выбрать файл"].isEnabled)
    XCTAssertFalse(element("Отправка остановлена").exists)
    XCTAssertFalse(app.buttons["Проверить удаление"].exists)
    XCTAssertFalse(element("Импорт удалён").exists)
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 1)
    launch()
    XCTAssertTrue(app.buttons["Выбрать файл"].waitForExistence(timeout: 8))
    XCTAssertTrue(app.buttons["Выбрать файл"].isEnabled)
    XCTAssertFalse(element("Отправка остановлена").exists)
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 1)
    capture("cancel-pending-after-relaunch")
    // An unresolved old import does not trap a different explicit selection.
    pick("statement, csv"); tap("Отменить выбор")
    // Automatic recovery must finish the server deletion without a manual check button.
    var serverDeleted = false
    for _ in 0..<10 {
      let jobs = control("/__test/state")["jobs"] as! [[String: Any]]
      if jobs.last?["status"] as? String == "deleted" {
        serverDeleted = true
        break
      }
      Thread.sleep(forTimeInterval: 1.2)
    }
    XCTAssertTrue(serverDeleted, "Cancelled import must be deleted automatically")
    XCTAssertFalse(element("Отправка остановлена").exists)
    XCTAssertFalse(app.buttons["Проверить удаление"].exists)
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 1)
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 1)
    XCTAssertEqual(stats()["acceptedBytes"], before["acceptedBytes"]! + 112)
    XCTAssertEqual(stats()["deleteRequests"], before["deleteRequests"]! + 1)
    capture("cancel-server-deletion-confirmed")
    tap("Настройки подключения"); enterURL("http://127.0.0.1:8787")
    saveSettings()
  }
  func test11CancelPendingRequestAndReconcileAfterRelaunch() { checkCancellation(port: 8789, afterTimeout: false) }
  func test12CancelAfterTimeoutAndReconcileAfterRelaunch() { checkCancellation(port: 8790, afterTimeout: true) }
  func test13HappyAcceptance() {
    mode("happy"); launch()
    if app.buttons["Отменить выбор"].waitForExistence(timeout: 5) { tap("Отменить выбор") }
    let before = stats()
    capture("happy-home")
    tap("Настройки подключения"); capture("happy-settings"); tap("Закрыть настройки")
    pick("statement, csv")
    XCTAssertTrue(element("112 байт").waitForExistence(timeout: 5))
    capture("happy-confirmation")
    tap("Отменить выбор")
    XCTAssertEqual(stats()["createRequests"], before["createRequests"])
    pick("statement, csv"); tap("Подтвердить и отправить"); ready()
    capture("happy-report")
    tap("Подробнее: StreamBeam")
    XCTAssertTrue(element("01.10.2026").waitForExistence(timeout: 5))
    capture("happy-details"); tap("Закрыть подробности")
    deleteRequest(); deleted(); capture("happy-deleted")
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 1)
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 1)
    XCTAssertEqual(stats()["acceptedBytes"], before["acceptedBytes"]! + 112)
  }
  // Additional HTTP fault injection on a separate proxy; never change the supplied mock.
  func qaMode(_ value: String) { _ = control("/__qa/mode", mode: value, port: 8991) }
  func qaEvents() -> [[String: Any]] { control("/__qa/state", port: 8991)["events"] as! [[String: Any]] }
  func assertRawCSVRequests() {
    let posts = qaEvents().filter { $0["method"] as? String == "POST" && $0["route"] as? String == "/imports" }
    XCTAssertFalse(posts.isEmpty)
    for post in posts {
      XCTAssertEqual(post["contentType"] as? String, "application/octet-stream", "Verify the actual native HTTP header")
      XCTAssertEqual(post["bytes"] as? Int, 112)
      XCTAssertEqual(post["filenameHeaderPresent"] as? Bool, true)
      XCTAssertEqual(post["sha256"] as? String, "2d2eb2233378820aeeecfc3a5d54d1ecb5a0e48eaa1e672478acaa3822890c7c")
      XCTAssertEqual((post["keyHash"] as? String)?.count, 64)
    }
  }
  func proxyEndpoint(_ enabled: Bool) {
    tap("Настройки подключения")
    enterURL(enabled ? "http://127.0.0.1:8991" : "http://127.0.0.1:8787")
    saveSettings()
  }
  func test14HTTPProgressErrorAndStableDeletionKey() {
    mode("happy"); qaMode("progress"); let before = stats(); launch(); proxyEndpoint(true)
    pick("statement, csv"); tap("Подтвердить и отправить")
    XCTAssertTrue(element("Импорт в очереди").waitForExistence(timeout: 8))
    XCTAssertFalse(element("Регулярные списания").exists); capture("http-queued-no-report")
    XCTAssertTrue(element("Обрабатываем выписку").waitForExistence(timeout: 10))
    XCTAssertFalse(element("Регулярные списания").exists); capture("http-processing-no-report")
    ready()
    for (merchant, date) in [("StreamBeam", "01.10.2026"), ("BrightGrid", "03.10.2026")] {
      tap("Подробнее: " + merchant)
      scrollTo(element(date)); XCTAssertTrue(element(date).isHittable)
      capture("details-" + merchant); tap("Закрыть подробности")
    }
    deleteRequest()
    XCTAssertTrue(element("Удаляем импорт").waitForExistence(timeout: 5))
    XCTAssertFalse(element("Импорт удалён").exists); capture("http-deleting-not-deleted"); deleted()

    qaMode("error"); pick("statement, csv"); tap("Подтвердить и отправить")
    XCTAssertTrue(element("Ошибка обработки").waitForExistence(timeout: 15))
    XCTAssertEqual(app.activityIndicators.count, 0, "Server error must stop the progress spinner")
    scrollTo(app.buttons["Проверить статус"]); XCTAssertTrue(app.buttons["Проверить статус"].isEnabled)
    capture("http-server-error-actions-available")
    mode("delete_failure"); deleteRequest()
    XCTAssertTrue(element("Удаление не подтверждено").waitForExistence(timeout: 10))
    XCTAssertFalse(element("Импорт удалён").exists)
    mode("happy"); deleteRequest("Повторить удаление"); deleted()
    let attempts = qaEvents().filter { $0["mode"] as? String == "error" && $0["method"] as? String == "DELETE" }
    XCTAssertEqual(attempts.count, 2)
    XCTAssertNotNil(attempts.first?["keyHash"] as? String)
    XCTAssertEqual(attempts.first?["keyHash"] as? String, attempts.last?["keyHash"] as? String)
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 2)
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 2)
    assertRawCSVRequests()
    proxyEndpoint(false)
  }
  func test15HTTP404RetryAndMalformedResponseRecovery() {
    mode("happy"); qaMode("drop-first-post"); let before = stats(); launch(); proxyEndpoint(true)
    pick("statement, csv"); tap("Подтвердить и отправить")
    XCTAssertTrue(element("Нужно внимание").waitForExistence(timeout: 15))
    XCTAssertEqual(stats()["createRequests"], before["createRequests"])
    launch()
    XCTAssertTrue(element("Нужно внимание").waitForExistence(timeout: 15))
    tap("Проверить статус")
    XCTAssertEqual(stats()["createRequests"], before["createRequests"])
    capture("http-404-keeps-explicit-retry")
    tap("Восстановить / повторить с тем же ключом"); ready()
    let posts = qaEvents().filter { $0["mode"] as? String == "drop-first-post" && $0["method"] as? String == "POST" }
    XCTAssertEqual(posts.count, 2)
    assertRawCSVRequests()
    XCTAssertEqual(posts.first?["keyHash"] as? String, posts.last?["keyHash"] as? String)
    XCTAssertEqual(posts.first?["sha256"] as? String, posts.last?["sha256"] as? String)
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 1)
    deleteRequest(); deleted()

    qaMode("malformed-create"); pick("statement, csv"); tap("Подтвердить и отправить")
    XCTAssertTrue(element("Сервер вернул неожиданный ответ. Последнее подтверждённое состояние сохранено.").waitForExistence(timeout: 10))
    scrollTo(app.buttons["Проверить статус"]); XCTAssertTrue(app.buttons["Проверить статус"].isEnabled)
    capture("http-malformed-response-recoverable")
    tap("Проверить статус"); ready()
    XCTAssertEqual(stats()["createRequests"], before["createRequests"]! + 2)
    XCTAssertEqual(stats()["newJobs"], before["newJobs"]! + 2)
    assertRawCSVRequests()
    deleteRequest(); deleted(); proxyEndpoint(false)
  }
  // Read-only interaction on the physical phone; normal automatic recovery may run on launch.
  func test91ObserveHomeWithoutTechnicalCancellationNotice() {
    launch()
    let choose = app.buttons["Выбрать файл"]
    XCTAssertTrue(choose.waitForExistence(timeout: 10))
    XCTAssertTrue(choose.isEnabled)
    XCTAssertFalse(element("Отправка остановлена").exists)
    XCTAssertFalse(element("Импорт пока не найден. Проверку отмены сохранили.").exists)
    XCTAssertFalse(app.buttons["Проверить удаление"].exists)
    capture("home-without-technical-cancellation-notice")
  }
  // Explicit physical-device observation only. No picker, POST, DELETE or mock controls.
  func test90ObserveCurrentUncertainOperationWithoutMutations() {
    launch()
    XCTAssertTrue(app.buttons["Отменить отправку"].waitForExistence(timeout: 8))
    XCTAssertTrue(app.buttons["Отменить отправку"].isEnabled)
    capture("physical-cancel-available")
    XCTAssertTrue(element("Нужно внимание").waitForExistence(timeout: 20))
    let check = app.buttons["Проверить статус"]
    XCTAssertTrue(check.waitForExistence(timeout: 3))
    XCTAssertTrue(check.isEnabled)
    XCTAssertTrue(app.buttons["Восстановить / повторить с тем же ключом"].isEnabled)
    XCTAssertTrue(app.buttons["Отменить отправку"].isEnabled)
    capture("physical-uncertain-observation")
  }
}
