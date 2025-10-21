// =========================================================
// 📌 CONFIGURATION
// =========================================================
var ss = SpreadsheetApp.getActiveSpreadsheet();
var timezone = "Asia/Manila";

// SHEET REFERENCES
var managerSheet = ss.getSheetByName("Classes");
var studentSheet = ss.getSheetByName("Students");
var enrollmentSheet = ss.getSheetByName("Enrollment");

// =========================================================
// 🚪 Handle GET request from ESP8266
// =========================================================
function doGet(e) {
  var studentID, studentName;

  // ✅ Handle either StudentID or CardUID
  if (e.parameter.studentID) {
    studentID = String(e.parameter.studentID).trim();
    studentName = getStudentName(studentID);

  } else if (e.parameter.cardUID) {
    // Normalize UID (trim + uppercase)
    var rawUID = String(e.parameter.cardUID).trim().toUpperCase();
    Logger.log("🔍 Scanned UID: " + rawUID);

    // Try to find matching StudentID
    studentID = getStudentIdByCard(rawUID);
    if (studentID) {
      studentName = getStudentName(studentID);
    }
  }

  // ❌ Not found
  if (!studentID || !studentName) {
    Logger.log("⚠️ Student not found for UID/ID: " + (e.parameter.cardUID || e.parameter.studentID));
    return ContentService.createTextOutput("Student not found");
  }

  var now = new Date();
  var currDate = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
  var currTime = Utilities.formatDate(now, timezone, "HH:mm:ss");

  // ✅ Find the active class
  var classInfo = findActiveClass(now);
  if (!classInfo) {
    Logger.log("⚠️ No active class found right now");
    return ContentService.createTextOutput("No active class|found right now");
  }

  // ✅ Check if student is enrolled in this class
  if (!isStudentEnrolled(studentID, classInfo.classID)) {
    Logger.log("⚠️ " + studentName + " not enrolled in " + classInfo.classID);
    return ContentService.createTextOutput("You are not part|of this class");
  }

  // ✅ Determine attendance status
  var status = getAttendanceStatus(now, classInfo.start, classInfo.grace);

  // ✅ Log to daily sheet
  var sheetName = classInfo.className + "_" + currDate;
  var classSheet = ss.getSheetByName(sheetName);
  if (!classSheet) {
    classSheet = createDailyAttendanceSheet(classInfo, currDate);
  }

  // ✅ Update attendance row
  var data = classSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === studentID) {
      classSheet.getRange(i + 1, 3).setValue(currTime);
      classSheet.getRange(i + 1, 4).setValue(status);
      Logger.log("🕒 Marked " + studentName + " as " + status + " at " + currTime);
      break;
    }
  }

  return ContentService.createTextOutput(studentName + "|" + status);
}


// =========================================================
// 🔍 Find Active Class
// =========================================================
function findActiveClass(now) {
  var classes = managerSheet.getDataRange().getValues();
  var today = Utilities.formatDate(now, timezone, "E").toLowerCase();

  for (var i = 1; i < classes.length; i++) {
    var [classId, className, startCell, endCell, days, prof, email, graceMinutes] = classes[i];
    if (!startCell || !endCell) continue;

    var start = parseTime(now, startCell);
    var end = parseTime(now, endCell);
    if (!start || !end) continue;

    var classDays = (days || "").toLowerCase().split(/[\/,]/).map(d => d.trim());
    if (classDays.includes(today) && now >= start && now <= end) {
      return {
        classID: classId,
        className: className,
        start: start,
        end: end,
        prof: prof,
        email: email,
        grace: Number(graceMinutes) || 0
      };
    }
  }
  return null;
}

// =========================================================
// ⏰ Determine Attendance Status
// =========================================================
function getAttendanceStatus(now, startTime, graceMinutes) {
  var graceLimit = new Date(startTime.getTime() + graceMinutes * 60000);
  return now <= graceLimit ? "On-Time" : "Late";
}

// =========================================================
// 📊 Lookup Student Name
// =========================================================
function getStudentName(studentID) {
  var data = studentSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(studentID).trim()) {
      return data[i][1];
    }
  }
  return null;
}

// =========================================================
// 🔍 Lookup Student by CardUID → StudentID
// =========================================================
function getStudentIdByCard(cardUID) {
  var data = studentSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var sheetUID = String(data[i][2]).trim().toUpperCase();
    if (sheetUID === cardUID) {
      Logger.log("✅ Match found: " + sheetUID);
      return data[i][0]; // StudentID
    }
  }
  Logger.log("❌ No match for: " + cardUID);
  return null;
}

// =========================================================
// ✅ Check Enrollment
// =========================================================
function isStudentEnrolled(studentID, classID) {
  if (!enrollmentSheet) return false;
  var data = enrollmentSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === studentID && String(data[i][2]).trim() === classID) {
      return true;
    }
  }
  return false;
}

// =========================================================
// 🕒 Parse Time
// =========================================================
function parseTime(baseDate, cellValue) {
  if (!cellValue) return null;
  var todayStr = Utilities.formatDate(baseDate, timezone, "yyyy-MM-dd");

  if (Object.prototype.toString.call(cellValue) === "[object Date]") {
    var timeStr = Utilities.formatDate(cellValue, timezone, "HH:mm:ss");
    return new Date(todayStr + " " + timeStr);
  }

  if (typeof cellValue === "number") {
    var ms = Math.round(cellValue * 24 * 60 * 60 * 1000);
    var time = new Date(ms);
    var timeStr = Utilities.formatDate(time, timezone, "HH:mm:ss");
    return new Date(todayStr + " " + timeStr);
  }

  if (typeof cellValue === "string") {
    var timeStr = cellValue.trim();
    if (/^\d{1,2}:\d{2}$/.test(timeStr)) timeStr += ":00";
    return new Date(todayStr + " " + timeStr);
  }

  return null;
}

// =========================================================
// 📝 Create Daily Attendance Sheet
// =========================================================
function createDailyAttendanceSheet(classInfo, dateStr) {
  var sheetName = classInfo.className + "_" + dateStr;
  var sheet = ss.insertSheet(sheetName);

  sheet.appendRow(["StudentID", "StudentName", "Time", "Status"]);

  if (!enrollmentSheet) return sheet;

  var data = enrollmentSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim() === String(classInfo.classID).trim()) {
      var studentID = data[i][0];
      var studentName = getStudentName(studentID);
      sheet.appendRow([studentID, studentName, "", ""]);
    }
  }
  return sheet;
}

// =========================================================
// 📧 Manual Attendance Report Sender
// =========================================================
function sendAttendanceReport() {
  var data = managerSheet.getDataRange().getValues();
  var today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
  Logger.log("📅 Today: " + today);

  for (var i = 1; i < data.length; i++) {
    var className = data[i][1];
    var email = data[i][6];
    var sheetName = className + "_" + today;
    Logger.log("➡️ Checking " + sheetName + " for " + email);

    if (!email || !email.includes("@")) {
      Logger.log("⚠️ Invalid or missing email for " + className);
      continue;
    }

    var classSheet = ss.getSheetByName(sheetName);
    if (!classSheet) {
      Logger.log("❌ No sheet found for " + sheetName);
      continue;
    }

    var csvFile = convertSheetToCsv(classSheet);
    MailApp.sendEmail({
      to: email,
      subject: "Attendance Report - " + className + " (" + today + ")",
      body: "Attached is the attendance report for " + className,
      attachments: [{
        fileName: className + "_" + today + ".csv",
        content: csvFile,
        mimeType: "text/csv"
      }]
    });

    Logger.log("✅ Email sent to " + email + " for " + className);
  }
}


// =========================================================
// 📝 Convert Sheet to CSV
// =========================================================
function convertSheetToCsv(sheet) {
  var data = sheet.getDataRange().getValues();
  var csvRows = data.map(row => row.map(cell => {
    if (cell instanceof Date) {
      // Format as 12-hour time with AM/PM
      return Utilities.formatDate(cell, Session.getScriptTimeZone(), "hh:mm:ss a");
    } else if (typeof cell === "string" && cell.includes(",")) {
      // Quote text containing commas
      return `"${cell}"`;
    } else {
      return cell;
    }
  }).join(","));
  return csvRows.join("\n");
}

// =========================================================
// ⚙️ AUTO SEND AFTER CLASS
// =========================================================
function autoSendAttendanceReports() {
  var now = new Date();
  var today = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
  var classes = managerSheet.getDataRange().getValues();

  for (var i = 1; i < classes.length; i++) {
    var [classID, className, startTime, endTime, days, prof, email, grace, lastSent] = classes[i];
    if (!className || !email || !endTime) continue;

    var end = parseTime(now, endTime);
    var lastSentDate = lastSent ? Utilities.formatDate(new Date(lastSent), timezone, "yyyy-MM-dd") : "";

    // Skip if already sent today
    if (lastSentDate === today) continue;

    // Send only if class has ended
    if (now >= end) {
      var sheetName = className + "_" + today;
      var classSheet = ss.getSheetByName(sheetName);
      if (!classSheet) continue;

      var csvFile = convertSheetToCsv(classSheet);

      try {
        Logger.log("📨 Sending auto report for: " + className + " → " + email);
        MailApp.sendEmail({
          to: email,
          subject: "Attendance Report - " + className + " (" + today + ")",
          body: "Here’s the attendance report for " + className + " (" + today + ").",
          attachments: [{
            fileName: className + "_" + today + ".csv",
            content: csvFile,
            mimeType: "text/csv"
          }]
        });

        managerSheet.getRange(i + 1, 9).setValue(new Date()); // update LastSentDate
        Logger.log("✅ Email sent successfully for: " + className);
      } catch (err) {
        Logger.log("❌ Failed to send email for " + className + ": " + err);
      }
    }
  }
}
