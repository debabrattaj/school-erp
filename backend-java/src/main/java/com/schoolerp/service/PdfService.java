package com.schoolerp.service;

import com.itextpdf.io.image.ImageDataFactory;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Image;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.HorizontalAlignment;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * PDF generation, direct port of backend/app/pdf.py. Uses iText7 instead of
 * reportlab: same content and field mapping, laid out with iText's
 * high-level Document/Table API rather than pixel-matching reportlab's
 * manual canvas coordinates (a PDF download is consumed as a document by
 * the end user, not parsed field-by-field like the JSON endpoints, so byte-
 * for-byte layout parity isn't meaningful the way response-shape parity is
 * elsewhere in this port).
 */
@Service
public class PdfService {

    private static final Map<String, String> CURRENCY_SYMBOLS = Map.of(
            "INR", "Rs ", "USD", "$", "EUR", "EUR ", "GBP", "GBP ",
            "AED", "AED ", "SGD", "S$", "AUD", "A$", "CAD", "C$", "JPY", "JPY "
    );
    private static final DeviceRgb HEADER_BG = new DeviceRgb(37, 50, 75);
    private static final DeviceRgb BREAK_BG = new DeviceRgb(254, 243, 199);

    private final String uploadDir;

    public PdfService(com.schoolerp.config.SchoolErpProperties properties) {
        this.uploadDir = properties.getUploads().getDir();
    }

    private String money(Object amount, String currency) {
        String symbol = CURRENCY_SYMBOLS.getOrDefault(
                currency != null ? currency.toUpperCase() : "INR",
                (currency != null ? currency : "") + " "
        );
        double value = amount instanceof Number n ? n.doubleValue() : 0;
        return symbol + String.format("%,.2f", value);
    }

    private String str(Object value, String fallback) {
        return value != null ? value.toString() : fallback;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> list(Object value) {
        return value instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    }

    private Image loadImage(Object urlObj) {
        if (!(urlObj instanceof String url) || !url.startsWith("/uploads/")) {
            return null;
        }
        try {
            Path path = Path.of(uploadDir, url.substring("/uploads/".length()));
            if (!Files.exists(path)) {
                return null;
            }
            return new Image(ImageDataFactory.create(Files.readAllBytes(path)));
        } catch (Exception e) {
            return null;
        }
    }

    private byte[] render(PageSize pageSize, java.util.function.Consumer<Document> body) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (PdfDocument pdfDoc = new PdfDocument(new PdfWriter(out)); Document doc = new Document(pdfDoc, pageSize)) {
            doc.setMargins(50, 50, 50, 50);
            body.accept(doc);
        }
        return out.toByteArray();
    }

    // ===================== fee receipt =====================

    public byte[] feeReceiptPdf(Map<String, Object> data) {
        return render(PageSize.A4, doc -> {
            doc.add(new Paragraph(str(data.get("school_name"), "School")).setBold().setFontSize(18));
            doc.add(new Paragraph("Fee Receipt").setFontSize(11));
            doc.add(new Paragraph("Receipt No: " + str(data.get("receipt_no"), "-")).setTextAlignment(TextAlignment.RIGHT).setFontSize(10));
            addHr(doc);

            String currency = (String) data.get("currency");
            addRow(doc, "Student", str(data.get("student_name"), "-"));
            addRow(doc, "Class", str(data.get("class_label"), "-"));
            addRow(doc, "Academic Year", str(data.get("academic_year"), "-"));
            addRow(doc, "Fee Type", str(data.get("fee_type"), "-"));
            addRow(doc, "Payment Date", str(data.get("payment_date"), "-"));
            addHr(doc);

            addRow(doc, "Total Amount", money(data.get("total"), currency));
            addRow(doc, "Paid Amount", money(data.get("paid"), currency));
            addRow(doc, "Balance", money(data.get("balance"), currency));
            addRow(doc, "Status", str(data.get("status"), "-"));

            addFooter(doc, "This is a computer-generated receipt.");
        });
    }

    // ===================== report card =====================

    public byte[] reportCardPdf(Map<String, Object> data) {
        return render(PageSize.A4, doc -> {
            doc.add(new Paragraph(str(data.get("school_name"), "School")).setBold().setFontSize(18).setTextAlignment(TextAlignment.CENTER));
            doc.add(new Paragraph("Report Card").setBold().setFontSize(12).setTextAlignment(TextAlignment.CENTER));
            addHr(doc);

            doc.add(new Paragraph("Student: " + str(data.get("student_name"), "-")).setFontSize(10));
            doc.add(new Paragraph("Admission No: " + str(data.get("admission_no"), "-")).setFontSize(10).setTextAlignment(TextAlignment.RIGHT));
            doc.add(new Paragraph("Class: " + str(data.get("class_label"), "-")).setFontSize(10));
            doc.add(new Paragraph("Academic Year: " + str(data.get("academic_year"), "-")).setFontSize(10).setTextAlignment(TextAlignment.RIGHT));
            doc.add(new Paragraph("Exam: " + str(data.get("exam_name"), "-")).setFontSize(10));

            doc.add(marksTable(list(data.get("rows"))));

            Object totalObtained = data.getOrDefault("total_obtained", 0);
            Object totalMax = data.getOrDefault("total_max", 0);
            Object percentage = data.getOrDefault("percentage", 0);
            doc.add(new Paragraph("Total: " + totalObtained + " / " + totalMax).setBold().setFontSize(11));
            doc.add(new Paragraph(String.format("Percentage: %.2f%%", ((Number) percentage).doubleValue()))
                    .setTextAlignment(TextAlignment.RIGHT).setFontSize(11));
            doc.add(new Paragraph("Overall Grade: " + str(data.get("overall_grade"), "-")).setBold().setFontSize(11));

            addFooter(doc, "This is a computer-generated report card.");
        });
    }

    // ===================== transcript =====================

    public byte[] transcriptPdf(Map<String, Object> data) {
        return render(PageSize.A4, doc -> {
            doc.add(new Paragraph(str(data.get("school_name"), "School")).setBold().setFontSize(18).setTextAlignment(TextAlignment.CENTER));
            doc.add(new Paragraph("Academic Transcript").setBold().setFontSize(13).setTextAlignment(TextAlignment.CENTER));
            addHr(doc);

            doc.add(new Paragraph("Student: " + str(data.get("student_name"), "-")).setFontSize(10));
            doc.add(new Paragraph("Admission No: " + str(data.get("admission_no"), "-")).setFontSize(10).setTextAlignment(TextAlignment.RIGHT));
            if (data.get("dob") != null) {
                doc.add(new Paragraph("Date of Birth: " + data.get("dob")).setFontSize(10));
            }

            List<Map<String, Object>> years = list(data.get("years"));
            if (years.isEmpty()) {
                doc.add(new Paragraph("No academic records found.").setItalic().setFontSize(10));
            }

            for (Map<String, Object> yearBlock : years) {
                doc.add(new Paragraph("Academic Year: " + str(yearBlock.get("academic_year"), "-")).setBold().setFontSize(12));
                doc.add(new Paragraph("Class: " + str(yearBlock.get("class_label"), "-")).setFontSize(10).setTextAlignment(TextAlignment.RIGHT));
                addHr(doc);

                List<Map<String, Object>> exams = list(yearBlock.get("exams"));
                if (exams.isEmpty()) {
                    doc.add(new Paragraph("No exam records for this academic year.").setItalic().setFontSize(9.5f));
                }
                for (Map<String, Object> exam : exams) {
                    doc.add(new Paragraph(str(exam.get("exam_name"), "-")).setBold().setFontSize(10.5f));
                    doc.add(marksTable(list(exam.get("rows"))));

                    Object totalObtained = exam.getOrDefault("total_obtained", 0);
                    Object totalMax = exam.getOrDefault("total_max", 0);
                    Object percentage = exam.getOrDefault("percentage", 0);
                    doc.add(new Paragraph("Total: " + totalObtained + " / " + totalMax).setBold().setFontSize(9.5f));
                    doc.add(new Paragraph(String.format("Percentage: %.2f%%  |  Grade: %s",
                            ((Number) percentage).doubleValue(), str(exam.get("overall_grade"), "-")))
                            .setTextAlignment(TextAlignment.RIGHT).setFontSize(9.5f));
                }
            }

            doc.add(new Paragraph("Principal / Authorised Signatory").setBold().setFontSize(11).setTextAlignment(TextAlignment.RIGHT));
            addFooter(doc, "This is a computer-generated transcript.");
        });
    }

    private Table marksTable(List<Map<String, Object>> rows) {
        Table table = new Table(UnitValue.createPercentArray(new float[]{4, 1, 1, 1})).useAllAvailableWidth();
        for (String header : List.of("Subject", "Marks", "Max", "Grade")) {
            table.addHeaderCell(headerCell(header));
        }
        for (Map<String, Object> row : rows) {
            table.addCell(bodyCell(str(row.get("subject"), "-"), TextAlignment.LEFT));
            table.addCell(bodyCell(numeric(row.get("obtained")), TextAlignment.CENTER));
            table.addCell(bodyCell(numeric(row.get("max")), TextAlignment.CENTER));
            table.addCell(bodyCell(str(row.get("grade"), "-"), TextAlignment.CENTER));
        }
        return table;
    }

    private String numeric(Object value) {
        double d = value instanceof Number n ? n.doubleValue() : 0;
        return d == Math.floor(d) ? String.valueOf((long) d) : String.valueOf(d);
    }

    // ===================== timetable =====================

    public byte[] timetablePdf(Map<String, Object> data) {
        return render(PageSize.A4.rotate(), doc -> {
            doc.add(new Paragraph(str(data.get("school_name"), "School")).setBold().setFontSize(16).setTextAlignment(TextAlignment.CENTER));
            doc.add(new Paragraph(str(data.get("subtitle"), "Timetable")).setBold().setFontSize(12).setTextAlignment(TextAlignment.CENTER));
            doc.add(new Paragraph(str(data.get("title"), "-") + "    |    Academic Year: " + str(data.get("academic_year"), "-"))
                    .setFontSize(10).setTextAlignment(TextAlignment.CENTER));

            List<String> days = ((List<?>) data.getOrDefault("days", List.of())).stream().map(String::valueOf).toList();
            List<Map<String, Object>> rows = list(data.get("rows"));

            float[] widths = new float[days.size() + 1];
            widths[0] = 2;
            for (int i = 1; i < widths.length; i++) widths[i] = 1;
            Table table = new Table(UnitValue.createPercentArray(widths)).useAllAvailableWidth();

            table.addHeaderCell(headerCell("Period / Time"));
            for (String day : days) {
                table.addHeaderCell(headerCell(day));
            }

            for (Map<String, Object> row : rows) {
                boolean isBreak = Boolean.TRUE.equals(row.get("is_break"));
                if (isBreak) {
                    Cell breakCell = new Cell(1, days.size() + 1)
                            .setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.LIGHT_GRAY, 0.5f))
                            .setBackgroundColor(BREAK_BG);
                    breakCell.add(new Paragraph(str(row.get("break_label"), "Break")).setFontSize(10).setTextAlignment(TextAlignment.CENTER));
                    table.addCell(breakCell);
                    continue;
                }

                String timeLabel = "P" + row.get("period_no");
                if (row.get("start_time") != null && row.get("end_time") != null) {
                    timeLabel += " (" + row.get("start_time") + "-" + row.get("end_time") + ")";
                }
                table.addCell(bodyCell(timeLabel, TextAlignment.CENTER));

                @SuppressWarnings("unchecked")
                Map<String, Object> cells = (Map<String, Object>) row.getOrDefault("cells", Map.of());
                for (String day : days) {
                    Object cellObj = cells.get(day);
                    String text = "-";
                    if (cellObj instanceof Map<?, ?> cell) {
                        String line1 = str(cell.get("line1"), "");
                        String line2 = str(cell.get("line2"), "");
                        String joined = String.join(" - ", java.util.stream.Stream.of(line1, line2).filter(s -> !s.isBlank()).toList());
                        text = joined.isBlank() ? "-" : joined;
                    }
                    table.addCell(bodyCell(text, TextAlignment.CENTER));
                }
            }

            doc.add(table);
            addFooter(doc, "This is a computer-generated timetable.");
        });
    }

    // ===================== certificates =====================

    public byte[] bonafideCertificatePdf(Map<String, Object> data) {
        return render(PageSize.A4, doc -> {
            addCertHeader(doc, data);

            doc.add(new Paragraph("BONAFIDE CERTIFICATE").setBold().setFontSize(15).setTextAlignment(TextAlignment.CENTER));

            String name = str(data.get("student_name"), "-");
            String father = data.get("father_name") != null ? (String) data.get("father_name")
                    : str(data.get("guardian_name"), "-");
            String klass = str(data.get("class_label"), "-");
            String year = str(data.get("academic_year"), "-");
            String adm = str(data.get("admission_no"), "-");
            String dob = str(data.get("dob"), "-");

            String body = "This is to certify that " + name + ", "
                    + (!"-".equals(father) ? "son/daughter of " + father + " " : "")
                    + "bearing Admission No. " + adm + ", is a bonafide student of this institution. "
                    + "He/She is currently studying in Class " + klass + " during the academic year " + year + ". "
                    + "His/Her date of birth as per our records is " + dob + ".";

            doc.add(new Paragraph(body).setFontSize(11));
            doc.add(new Paragraph("Date of Issue: " + str(data.get("issue_date"), "-")).setFontSize(10));
            doc.add(new Paragraph("Principal / Authorised Signatory").setBold().setFontSize(11).setTextAlignment(TextAlignment.RIGHT));

            addFooter(doc, "This is a computer-generated certificate.");
        });
    }

    public byte[] transferCertificatePdf(Map<String, Object> data) {
        return render(PageSize.A4, doc -> {
            addCertHeader(doc, data);

            doc.add(new Paragraph("TRANSFER CERTIFICATE").setBold().setFontSize(15).setTextAlignment(TextAlignment.CENTER));
            doc.add(new Paragraph("TC No: " + str(data.get("tc_no"), "-")).setFontSize(9).setTextAlignment(TextAlignment.RIGHT));

            List<Map.Entry<String, String>> rows = List.of(
                    Map.entry("Student Name", str(data.get("student_name"), "-")),
                    Map.entry("Admission No", str(data.get("admission_no"), "-")),
                    Map.entry("Father's Name", str(data.get("father_name"), "-")),
                    Map.entry("Mother's Name", str(data.get("mother_name"), "-")),
                    Map.entry("Date of Birth", str(data.get("dob"), "-")),
                    Map.entry("Nationality", str(data.get("nationality"), "-")),
                    Map.entry("Class", str(data.get("class_label"), "-")),
                    Map.entry("Academic Year", str(data.get("academic_year"), "-")),
                    Map.entry("Date of Admission", str(data.get("admission_date"), "-")),
                    Map.entry("Date of Leaving", str(data.get("leaving_date"), "-")),
                    Map.entry("Reason for Leaving", str(data.get("reason"), "-")),
                    Map.entry("Conduct", str(data.get("conduct"), "Good"))
            );
            for (Map.Entry<String, String> row : rows) {
                addRow(doc, row.getKey(), row.getValue());
            }

            doc.add(new Paragraph("Date of Issue: " + str(data.get("issue_date"), "-")).setFontSize(10));
            doc.add(new Paragraph("Principal / Authorised Signatory").setBold().setFontSize(11).setTextAlignment(TextAlignment.RIGHT));

            addFooter(doc, "This is a computer-generated certificate.");
        });
    }

    private void addCertHeader(Document doc, Map<String, Object> data) {
        Image logo = loadImage(data.get("logo_url"));
        if (logo != null) {
            logo.setWidth(50).setHeight(50);
            doc.add(logo);
        }
        doc.add(new Paragraph(str(data.get("school_name"), "School")).setBold().setFontSize(18));
        if (data.get("school_address") != null) {
            doc.add(new Paragraph(String.valueOf(data.get("school_address"))).setFontSize(9));
        }
        addHr(doc);
    }

    // ===================== ID card =====================

    public byte[] studentIdCardPdf(Map<String, Object> data) {
        PageSize cardSize = new PageSize(153, 244); // ~54mm x 86mm at 72dpi
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (PdfDocument pdfDoc = new PdfDocument(new PdfWriter(out)); Document doc = new Document(pdfDoc, cardSize)) {
            doc.setMargins(6, 6, 6, 6);

            Table header = new Table(UnitValue.createPercentArray(new float[]{1})).useAllAvailableWidth();
            Cell headerCell = new Cell().setBackgroundColor(HEADER_BG).setBorder(Border.NO_BORDER);
            headerCell.add(new Paragraph(truncate(str(data.get("school_name"), "School"), 26))
                    .setFontColor(com.itextpdf.kernel.colors.ColorConstants.WHITE).setBold().setFontSize(7.5f));
            headerCell.add(new Paragraph("STUDENT IDENTITY CARD")
                    .setFontColor(com.itextpdf.kernel.colors.ColorConstants.WHITE).setFontSize(5.5f));
            header.addCell(headerCell);
            doc.add(header);

            Image photo = loadImage(data.get("photo_url"));
            if (photo != null) {
                photo.setWidth(68).setHeight(80).setHorizontalAlignment(HorizontalAlignment.CENTER);
                doc.add(photo);
            } else {
                doc.add(new Paragraph("No Photo").setFontSize(6).setTextAlignment(TextAlignment.CENTER));
            }

            doc.add(new Paragraph(truncate(str(data.get("student_name"), "-"), 28)).setBold().setFontSize(9).setTextAlignment(TextAlignment.CENTER));

            List<Map.Entry<String, String>> details = List.of(
                    Map.entry("Adm No", str(data.get("admission_no"), "-")),
                    Map.entry("Class", str(data.get("class_label"), "-")),
                    Map.entry("DOB", str(data.get("dob"), "-")),
                    Map.entry("Blood", str(data.get("blood_group"), "-")),
                    Map.entry("Guardian", str(data.get("guardian_name"), "-")),
                    Map.entry("Phone", str(data.get("guardian_phone"), "-"))
            );
            for (Map.Entry<String, String> detail : details) {
                doc.add(new Paragraph(detail.getKey() + ": " + truncate(detail.getValue(), 22)).setFontSize(6));
            }
        }
        return out.toByteArray();
    }

    private String truncate(String value, int max) {
        return value.length() > max ? value.substring(0, max) : value;
    }

    // ===================== shared layout helpers =====================

    private void addHr(Document doc) {
        doc.add(new com.itextpdf.layout.element.LineSeparator(new com.itextpdf.kernel.pdf.canvas.draw.SolidLine(0.5f))
                .setMarginTop(2).setMarginBottom(6));
    }

    private void addRow(Document doc, String label, String value) {
        Paragraph p = new Paragraph().setFontSize(10).setMarginBottom(2);
        p.add(new com.itextpdf.layout.element.Text(label + ": ").setBold());
        p.add(value);
        doc.add(p);
    }

    private void addFooter(Document doc, String text) {
        doc.add(new Paragraph(text).setItalic().setFontSize(8).setMarginTop(20));
    }

    private Cell headerCell(String text) {
        Cell cell = new Cell().setBackgroundColor(HEADER_BG).setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.LIGHT_GRAY, 0.5f));
        cell.add(new Paragraph(text).setFontColor(com.itextpdf.kernel.colors.ColorConstants.WHITE).setBold().setFontSize(10).setTextAlignment(TextAlignment.CENTER));
        return cell;
    }

    private Cell bodyCell(String text, TextAlignment align) {
        Cell cell = new Cell().setBorder(new SolidBorder(com.itextpdf.kernel.colors.ColorConstants.LIGHT_GRAY, 0.5f));
        cell.add(new Paragraph(text).setFontSize(10).setTextAlignment(align));
        return cell;
    }
}
