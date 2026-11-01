/**
 * Reef Command Center - Google Apps Script Backend
 * 
 * INSTRUCTIONS TO UPDATE YOUR GOOGLE SHEET:
 * 1. Open your Reef Command Center Google Spreadsheet.
 * 2. In the top menu, click Extensions > Apps Script.
 * 3. Replace the existing script contents with all the code in this file.
 * 4. Click the 'Save' icon (floppy disk) or press Ctrl+S / Cmd+S.
 * 5. In the top right, click 'Deploy' > 'Manage deployments'.
 * 6. Click the pencil icon (Edit) next to your Active deployment.
 * 7. Under 'Version', select 'New version'.
 * 8. Click 'Deploy'.
 * 
 * Note: If you don't already have a 'Notes' tab in your sheet, this script
 * will automatically create one with the correct column headers on its first run!
 */

function doGet(e) {
  try {
    var sheetName = (e && e.parameter && e.parameter.sheet) ? e.parameter.sheet : "WB35";
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    // Auto-create Notes tab if it doesn't exist yet
    if (!sheet && sheetName.toLowerCase() === "notes") {
      sheet = ss.insertSheet("Notes");
      sheet.appendRow(["id", "date", "tank", "category", "text", "createdAt"]);
      sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
    }

    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Sheet not found: " + sheetName }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = data[0];
    var rows = [];

    for (var i = 1; i < data.length; i++) {
      var row = {};
      var isEmpty = true;
      for (var j = 0; j < headers.length; j++) {
        var headerKey = String(headers[j]).trim().toLowerCase();
        var val = data[i][j];

        // Format dates cleanly if Google Sheets converted them to Date objects
        if (val instanceof Date) {
          if (headerKey.toLowerCase() === "date") {
            val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
          } else {
            val = val.toISOString();
          }
        }

        if (val !== "" && val !== null && val !== undefined) {
          isEmpty = false;
        }
        row[headerKey] = val;
      }
      if (!isEmpty) {
        rows.push(row);
      }
    }

    return ContentService.createTextOutput(JSON.stringify(rows))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheetName = data.sheetName || "WB35";
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    // --- HANDLE NOTES ---
    if (sheetName.toLowerCase() === "notes") {
      if (!sheet) {
        sheet = ss.insertSheet("Notes");
        sheet.appendRow(["id", "date", "tank", "category", "text", "createdAt"]);
        sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
      }

      // Handle Delete Action
      if (data.action === "delete" && data.id) {
        var values = sheet.getDataRange().getValues();
        var idCol = 0; // Column A is "id"
        var deleted = false;
        for (var i = values.length - 1; i >= 1; i--) {
          if (String(values[i][idCol]) === String(data.id)) {
            sheet.deleteRow(i + 1);
            deleted = true;
            break;
          }
        }
        return ContentService.createTextOutput(JSON.stringify({ status: "success", deleted: deleted }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // Handle Add Note Action
      var noteId = data.id || ("note_" + new Date().getTime());
      var noteDate = data.date || Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
      var noteTank = data.tank || "GENERAL";
      var noteCat = data.category || "Observation";
      var noteText = data.text || "";
      var createdAt = data.createdAt || new Date().getTime();

      sheet.appendRow([noteId, noteDate, noteTank, noteCat, noteText, createdAt]);

      return ContentService.createTextOutput(JSON.stringify({ status: "success", id: noteId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // --- HANDLE WATER PARAMETER LOGGING (WB35, IM24, etc.) ---
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Sheet not found: " + sheetName }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    sheet.appendRow([
      data.date,
      data.alk,
      data.ca,
      data.mg,
      data.no3,
      data.po4,
      data.ph
    ]);

    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
