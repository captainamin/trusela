/**
 * Google Apps Script Web App Endpoint for Trusela Subscription Licensing System
 * 
 * Exposes API endpoints for activation key management.
 * Setup: Deploy as Web App -> Execute as "Me" -> Access: "Anyone"
 */

// Initialize Database Sheets if not exists
function initDatabaseSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Activation Keys Sheet
  var keysSheet = ss.getSheetByName("ActivationKeys");
  if (!keysSheet) {
    keysSheet = ss.insertSheet("ActivationKeys");
    keysSheet.appendRow([
      "KeyID", "BatchID", "ActivationKeyHash", "Plan", 
      "DurationDays", "Price", "Status", "GeneratedDate", 
      "ActivatedBy", "ActivatedDate", "ExpiryDate", "CreatedBy"
    ]);
  }
  
  // 2. Users Subscription Sheet
  var usersSheet = ss.getSheetByName("UsersSubscription");
  if (!usersSheet) {
    usersSheet = ss.insertSheet("UsersSubscription");
    usersSheet.appendRow([
      "UserID", "Email", "Role", "SubscriptionPlan", 
      "SubscriptionStatus", "SubscriptionExpiry", "LastActivationDate"
    ]);
  }
  
  // 3. Subscription Plans Sheet
  var plansSheet = ss.getSheetByName("SubscriptionPlans");
  if (!plansSheet) {
    plansSheet = ss.insertSheet("SubscriptionPlans");
    plansSheet.appendRow(["PlanID", "Name", "DurationDays", "Price"]);
    plansSheet.appendRow(["monthly", "Monthly Plan", 30, 3000]);
    plansSheet.appendRow(["quarterly", "Quarterly Plan", 90, 8000]);
    plansSheet.appendRow(["yearly", "Yearly Plan", 365, 30000]);
    plansSheet.appendRow(["lifetime", "Lifetime Plan", 99999, 100000]);
  }
}

// SHA-256 Hashing helper
function sha256(text) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  var output = "";
  for (var i = 0; i < rawHash.length; i++) {
    var v = rawHash[i];
    if (v < 0) v += 256;
    var byteString = v.toString(16);
    if (byteString.length == 1) byteString = "0" + byteString;
    output += byteString;
  }
  return output;
}

// Generate Secure key format TS-XXXX-XXXX-XXXX-XXXX-XXXX
function generateSecureKey() {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var key = "TS";
  for (var block = 0; block < 5; block++) {
    var blockStr = "";
    for (var i = 0; i < 4; i++) {
      var randIdx = Math.floor(Math.random() * chars.length);
      blockStr += chars.charAt(randIdx);
    }
    key += "-" + blockStr;
  }
  return key;
}

// JSON Response helper with CORS
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// GET Requests
function doGet(e) {
  initDatabaseSheets();
  var action = e.parameter.action;
  
  try {
    if (action === "listKeys") {
      return handleListKeys(e);
    } else if (action === "getSubscriptionStatus") {
      return handleGetSubscriptionStatus(e);
    } else if (action === "exportBatch") {
      return handleExportBatch(e);
    } else {
      return jsonResponse({ success: false, error: "Invalid action: " + action });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// POST Requests
function doPost(e) {
  initDatabaseSheets();
  
  var postData = {};
  if (e.postData && e.postData.contents) {
    try {
      postData = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonResponse({ success: false, error: "Malformed JSON payload" });
    }
  }
  
  var action = e.parameter.action || postData.action;
  
  try {
    if (action === "generateKeys") {
      return handleGenerateKeys(postData);
    } else if (action === "activateKey") {
      return handleActivateKey(postData);
    } else if (action === "revokeKey") {
      return handleRevokeKey(postData);
    } else if (action === "updatePlans") {
      return handleUpdatePlans(postData);
    } else {
      return jsonResponse({ success: false, error: "Invalid POST action: " + action });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// --- Handler Actions ---

function handleListKeys(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("ActivationKeys");
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var keys = [];
  
  var filterPlan = e.parameter.plan;
  var filterStatus = e.parameter.status;
  var filterBatch = e.parameter.batch;
  
  for (var i = 1; i < rows.length; i++) {
    var keyObj = {};
    for (var j = 0; j < headers.length; j++) {
      keyObj[headers[j]] = rows[i][j];
    }
    
    // Filtering logic
    if (filterPlan && keyObj.Plan !== filterPlan) continue;
    if (filterStatus && keyObj.Status !== filterStatus) continue;
    if (filterBatch && keyObj.BatchID !== filterBatch) continue;
    
    keys.push(keyObj);
  }
  
  return jsonResponse({ success: true, keys: keys });
}

function handleGetSubscriptionStatus(e) {
  var userId = e.parameter.userId;
  if (!userId) return jsonResponse({ success: false, error: "userId is required" });
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("UsersSubscription");
  var rows = sheet.getDataRange().getValues();
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      return jsonResponse({
        success: true,
        userId: rows[i][0],
        email: rows[i][1],
        role: rows[i][2],
        subscriptionPlan: rows[i][3],
        subscriptionStatus: rows[i][4],
        subscriptionExpiry: rows[i][5],
        lastActivationDate: rows[i][6]
      });
    }
  }
  
  return jsonResponse({ success: true, subscriptionStatus: "expired", message: "User not found, defaults to expired" });
}

function handleExportBatch(e) {
  var batchId = e.parameter.batchId;
  if (!batchId) return jsonResponse({ success: false, error: "batchId is required" });
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("ActivationKeys");
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var batchKeys = [];
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] === batchId) {
      var keyObj = {};
      for (var j = 0; j < headers.length; j++) {
        keyObj[headers[j]] = rows[i][j];
      }
      batchKeys.push(keyObj);
    }
  }
  
  return jsonResponse({ success: true, batchId: batchId, keys: batchKeys });
}

function handleGenerateKeys(data) {
  var planId = data.planId;
  var quantity = Number(data.quantity) || 1;
  var batchName = data.batchName;
  var createdBy = data.userId || "admin";
  
  if (!planId || !batchName) return jsonResponse({ success: false, error: "planId and batchName are required" });
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Fetch Plan Price/Duration
  var plansSheet = ss.getSheetByName("SubscriptionPlans");
  var plansRows = plansSheet.getDataRange().getValues();
  var durationDays = 30;
  var price = 3000;
  var planFound = false;
  
  for (var i = 1; i < plansRows.length; i++) {
    if (plansRows[i][0] === planId) {
      durationDays = Number(plansRows[i][2]);
      price = Number(plansRows[i][3]);
      planFound = true;
      break;
    }
  }
  
  if (!planFound) return jsonResponse({ success: false, error: "Plan ID " + planId + " not found" });
  
  var keysSheet = ss.getSheetByName("ActivationKeys");
  var generatedKeys = [];
  var nowStr = new Date().toISOString();
  
  for (var k = 0; k < quantity; k++) {
    var rawKey = generateSecureKey();
    var hash = sha256(rawKey);
    var keyId = hash.substring(0, 8).toUpperCase();
    
    keysSheet.appendRow([
      keyId,
      batchName,
      hash,
      planId,
      durationDays,
      price,
      "Unused",
      nowStr,
      "", // ActivatedBy
      "", // ActivatedDate
      "", // ExpiryDate
      createdBy
    ]);
    
    generatedKeys.push(rawKey);
  }
  
  return jsonResponse({
    success: true,
    batchId: batchName,
    plan: planId,
    keys: generatedKeys
  });
}

function handleActivateKey(data) {
  var activationKey = data.activationKey;
  var userId = data.userId;
  var username = data.username;
  
  if (!activationKey || !userId || !username) {
    return jsonResponse({ success: false, error: "activationKey, userId, and username are required" });
  }
  
  var hash = sha256(activationKey);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Find key
  var keysSheet = ss.getSheetByName("ActivationKeys");
  var keysRange = keysSheet.getDataRange();
  var keysRows = keysRange.getValues();
  var keyRowIdx = -1;
  var keyData = {};
  
  for (var i = 1; i < keysRows.length; i++) {
    if (keysRows[i][2] === hash) {
      keyRowIdx = i;
      keyData = {
        keyId: keysRows[i][0],
        batchId: keysRows[i][1],
        plan: keysRows[i][3],
        durationDays: Number(keysRows[i][4]),
        status: keysRows[i][6]
      };
      break;
    }
  }
  
  if (keyRowIdx === -1) return jsonResponse({ success: false, error: "Invalid activation key" });
  if (keyData.status !== "Unused") return jsonResponse({ success: false, error: "Activation key is " + keyData.status });
  
  // 2. Find User
  var usersSheet = ss.getSheetByName("UsersSubscription");
  var usersRange = usersSheet.getDataRange();
  var usersRows = usersRange.getValues();
  var userRowIdx = -1;
  var userData = {};
  
  for (var u = 1; u < usersRows.length; u++) {
    if (usersRows[u][0] === userId) {
      userRowIdx = u;
      userData = {
        subscriptionStatus: usersRows[u][4],
        subscriptionExpiry: usersRows[u][5]
      };
      break;
    }
  }
  
  var now = new Date();
  var newExpiry = new Date();
  var isLifetime = keyData.plan === "lifetime";
  
  if (userRowIdx !== -1 && userData.subscriptionStatus === "Active" && userData.subscriptionExpiry) {
    var curExpiry = new Date(userData.subscriptionExpiry);
    if (curExpiry > now) {
      newExpiry = curExpiry;
    }
  }
  
  if (!isLifetime) {
    newExpiry.setDate(newExpiry.getDate() + keyData.durationDays);
  }
  
  var expiryStr = isLifetime ? "lifetime" : newExpiry.toISOString();
  var activatedDateStr = now.toISOString();
  
  // 3. Update User Subscription
  if (userRowIdx !== -1) {
    usersSheet.getCell(userRowIdx + 1, 4).setValue(keyData.plan); // Plan
    usersSheet.getCell(userRowIdx + 1, 5).setValue(isLifetime ? "Lifetime" : "Active"); // Status
    usersSheet.getCell(userRowIdx + 1, 6).setValue(isLifetime ? "" : expiryStr); // Expiry
    usersSheet.getCell(userRowIdx + 1, 7).setValue(activatedDateStr); // LastActivation
  } else {
    usersSheet.appendRow([
      userId,
      username,
      "user",
      keyData.plan,
      isLifetime ? "Lifetime" : "Active",
      isLifetime ? "" : expiryStr,
      activatedDateStr
    ]);
  }
  
  // 4. Update Key status to Used
  keysSheet.getCell(keyRowIdx + 1, 7).setValue("Used"); // Status
  keysSheet.getCell(keyRowIdx + 1, 9).setValue(userId); // ActivatedBy
  keysSheet.getCell(keyRowIdx + 1, 10).setValue(activatedDateStr); // ActivatedDate
  keysSheet.getCell(keyRowIdx + 1, 11).setValue(expiryStr); // ExpiryDate
  
  return jsonResponse({ success: true, message: "Subscription activated successfully" });
}

function handleRevokeKey(data) {
  var keyHash = data.keyHash;
  if (!keyHash) return jsonResponse({ success: false, error: "keyHash is required" });
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var keysSheet = ss.getSheetByName("ActivationKeys");
  var rows = keysSheet.getDataRange().getValues();
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][2] === keyHash) {
      if (rows[i][6] !== "Unused") {
        return jsonResponse({ success: false, error: "Cannot revoke key. Status is " + rows[i][6] });
      }
      keysSheet.getCell(i + 1, 7).setValue("Revoked");
      return jsonResponse({ success: true, message: "Key successfully revoked" });
    }
  }
  
  return jsonResponse({ success: false, error: "Key not found" });
}

function handleUpdatePlans(data) {
  var planId = data.planId;
  var name = data.name;
  var durationDays = Number(data.durationDays);
  var price = Number(data.price);
  
  if (!planId || !name || isNaN(durationDays) || isNaN(price)) {
    return jsonResponse({ success: false, error: "planId, name, durationDays, and price are required" });
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var plansSheet = ss.getSheetByName("SubscriptionPlans");
  var rows = plansSheet.getDataRange().getValues();
  
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === planId) {
      plansSheet.getCell(i + 1, 2).setValue(name);
      plansSheet.getCell(i + 1, 3).setValue(durationDays);
      plansSheet.getCell(i + 1, 4).setValue(price);
      return jsonResponse({ success: true, message: "Plan updated successfully" });
    }
  }
  
  return jsonResponse({ success: false, error: "Plan not found" });
}
