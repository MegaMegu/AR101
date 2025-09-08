// 📌 CONFIG
var ss = SpreadsheetApp.getActiveSpreadsheet();
var timezone = "Asia/Manila";

// SHEET NAMES
var managerSheet = ss.getSheetByName("Classes");
var studentSheet = ss.getSheetByName("Students");
var enrollmentSheet = ss.getSheetByName("Enrollment");

// =========================================================
// 🚪 Handle GET request from ESP8266
// Example: ?studentID=1001  OR  ?cardUID=A1B2C3D4
// =========================================================
function doGet(e) {
  var studentID, studentName;

  // ✅ Accept either StudentID or CardUID
  if (e.parameter.studentID) {
    studentID = String(e.parameter.studentID).trim();
    studentName = getStudentName(studentID);
  } else if (e.parameter.cardUID) {
    studentID = getStudentIdByCard(String(e.parameter.cardUID).trim());
    if (studentID) {
      studentName = getStudentName(studentID);
    }
  }

  if (!studentID || !studentName) {
    return ContentService.createTextOutput("Student not found");
  }

  var now = new Date();
  var currDate = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
  var currTime = Utilities.formatDate(now, timezone, "HH:mm:ss");

  // ✅ Find the active class automatically
  var classInfo = findActiveClass(now);
  if (!classInfo) {
    return ContentService.createTextOutput("No active class found right now");
  }

  // ✅ Check if student is enrolled in this class
  if (!isStudentEnrolled(studentID, classInfo.classID)) {
    return ContentService.createTextOutput("You are not part of this class");
  }

  // Determine attendance status
  var status = getAttendanceStatus(now, classInfo.start, classInfo.grace);

  // ✅ Daily sheet name → ClassName_yyyy-MM-dd
  var sheetName = classInfo.className + "_" + currDate;
  var classSheet = ss.getSheetByName(sheetName);
  if (!classSheet) {
    classSheet = createDailyAttendanceSheet(classInfo, currDate);
  }

  // Log attendance in daily sheet
  var data = classSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === studentID) {
      classSheet.getRange(i + 1, 3).setValue(currTime); // Time
      classSheet.getRange(i + 1, 4).setValue(status); // Status
      break;
    }
  }

  return ContentService.createTextOutput(
    "Attendance logged: " +
      studentName +
      " → " +
      classInfo.className +
      " (" +
      status +
      ")"
  );
}

// =========================================================
// 🔍 Find active class
// =========================================================
function findActiveClass(now) {
  var classes = managerSheet.getDataRange().getValues();
  var today = Utilities.formatDate(now, timezone, "E").toLowerCase();

  for (var i = 1; i < classes.length; i++) {
    var [
      classId,
      className,
      startCell,
      endCell,
      days,
      prof,
      email,
      graceMinutes,
    ] = classes[i];
    if (!startCell || !endCell) continue;

    var start = parseTime(now, startCell);
    var end = parseTime(now, endCell);
    if (!start || !end) continue;

    var classDays = (days || "")
      .toLowerCase()
      .split(/[\/,]/)
      .map((d) => d.trim());
    if (classDays.includes(today) && now >= start && now <= end) {
      return {
        classID: classId,
        className: className,
        start: start,
        end: end,
        prof: prof,
        email: email,
        grace: Number(graceMinutes) || 0,
      };
    }
  }
  return null;
}

// =========================================================
// ⏰ Attendance status
// =========================================================
function getAttendanceStatus(now, startTime, graceMinutes) {
  var graceLimit = new Date(startTime.getTime() + graceMinutes * 60000);
  return now <= graceLimit ? "On-Time" : "Late";
}

// =========================================================
// 📊 Lookup student name
// =========================================================
function getStudentName(studentID) {
  var data = studentSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(studentID).trim()) {
      return data[i][1]; // StudentName
    }
  }
  return null;
}

// =========================================================
// 🔍 Lookup student by CardUID → StudentID
// =========================================================
function getStudentIdByCard(cardUID) {
  var data = studentSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim() === cardUID) {
      // Column C = CardUID
      return data[i][0]; // return StudentID
    }
  }
  return null;
}

// =========================================================
// ✅ Check if student is enrolled in a class
// =========================================================
function isStudentEnrolled(studentID, classID) {
  if (!enrollmentSheet) return false;
  var data = enrollmentSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (
      String(data[i][0]).trim() === studentID &&
      String(data[i][2]).trim() === classID
    ) {
      return true;
    }
  }
  return false;
}

// =========================================================
// 🕒 Helper: parse StartTime/EndTime
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
// 📧 Email Attendance Report
// =========================================================
function sendAttendanceReport() {
  var data = managerSheet.getDataRange().getValues();
  var today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");

  for (var i = 1; i < data.length; i++) {
    var className = data[i][1];
    var email = data[i][6];
    var sheetName = className + "_" + today;
    var classSheet = ss.getSheetByName(sheetName);
    if (!classSheet) continue;

    var csvFile = convertSheetToCsv(classSheet);
    MailApp.sendEmail({
      to: email,
      subject: "Attendance Report - " + className + " (" + today + ")",
      body: "Attached is the attendance report for " + className,
      attachments: [
        {
          fileName: className + "_" + today + ".csv",
          content: csvFile,
          mimeType: "text/csv",
        },
      ],
    });
  }
}

// =========================================================
// 📝 Convert sheet to CSV
// =========================================================
function convertSheetToCsv(sheet) {
  var data = sheet.getDataRange().getValues();
  return data.map((r) => r.join(",")).join("\n");
}
