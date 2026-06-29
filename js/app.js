GET https://yuqimak.github.io/favicon.ico 404 (Not Found)
app.js?v=200:209 Firebase Data: {control: {…}, sensor: {…}, system: {…}}
logger.ts:117 [2026-06-29T15:40:22.381Z]  @firebase/database: FIREBASE WARNING: Exception was thrown by user callback. TypeError: Cannot set properties of null (setting 'innerText')
    at renderUI (https://yuqimak.github.io/control_monitoringaero_growlight_esp/js/app.js?v=200:193:29)
    at https://yuqimak.github.io/control_monitoringaero_growlight_esp/js/app.js?v=200:242:7
    at CallbackContext.onValue (https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js:1:157840)
    at https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js:1:167919
    at exceptionGuard (https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js:1:19286)
    at eventListRaise (https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js:1:142769)
    at eventQueueRaiseQueuedEventsMatchingPredicate (https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js:1:142495)
    at eventQueueRaiseEventsForChangedPath (https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js:1:142235)
    at repoOnDataUpdate (https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js:1:146406)
    at PersistentConnection.onDataUpdate_ (https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js:1:144016) 
(anonymous) @ logger.ts:117
warn @ logger.ts:209
(anonymous) @ util.ts:189
(anonymous) @ util.ts:549
setTimeout
(anonymous) @ util.ts:549
(anonymous) @ Repo.ts:193
eventQueue @ EventQueue.ts:129
eventQueueRaiseEventsForChangedPath @ EventQueue.ts:109
repoOnDataUpdate @ Repo.ts:409
(anonymous) @ Repo.ts:262
onDataPush_ @ PersistentConnection.ts:670
onDataMessage_ @ PersistentConnection.ts:661
onDataMessage_ @ Connection.ts:325
onPrimaryMessageReceived_ @ Connection.ts:318
(anonymous) @ Connection.ts:211
appendFrame_ @ WebSocketConnection.ts:308
handleIncomingFrame @ WebSocketConnection.ts:362
(anonymous) @ WebSocketConnection.ts:225
util.ts:549 Uncaught TypeError: Cannot set properties of null (setting 'innerText')
    at renderUI (app.js?v=200:193:29)
    at app.js?v=200:242:7
    at CallbackContext.onValue (EventRegistration.ts:63:7)
    at Reference_impl.ts:861:35
    at exceptionGuard (util.ts:548:23)
    at eventListRaise (Repo.ts:193:12)
    at eventQueueRaiseQueuedEventsMatchingPredicate (EventQueue.ts:129:20)
    at eventQueueRaiseEventsForChangedPath (EventQueue.ts:109:5)
    at repoOnDataUpdate (Repo.ts:409:44)
    at PersistentConnection.onDataUpdate_ (Repo.ts:262:9)
