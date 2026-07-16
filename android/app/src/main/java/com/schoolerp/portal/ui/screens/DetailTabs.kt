package com.schoolerp.portal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.schoolerp.portal.network.AttendanceResponse
import com.schoolerp.portal.network.ExamResult
import com.schoolerp.portal.ui.ChildDetailViewModel
import com.schoolerp.portal.ui.Loadable
import com.schoolerp.portal.ui.components.ErrorBox
import com.schoolerp.portal.ui.components.InfoRow
import com.schoolerp.portal.ui.components.LoadingBox
import com.schoolerp.portal.ui.components.SectionCard
import com.schoolerp.portal.ui.percent

/** Shared loading/error/empty wrapper for a tab's [Loadable] state. */
@Composable
private fun <T> TabState(
    state: Loadable<T>,
    onRetry: () -> Unit,
    isEmpty: (T) -> Boolean = { false },
    emptyText: String = "Nothing to show yet.",
    content: @Composable (T) -> Unit,
) {
    when {
        state.loading && state.data == null -> LoadingBox()
        state.error != null && state.data == null -> ErrorBox(state.error, onRetry = onRetry)
        state.data != null && isEmpty(state.data) -> EmptyMessage(emptyText)
        state.data != null -> content(state.data)
    }
}

@Composable
private fun EmptyMessage(text: String) {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(
            text,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ---------------- Profile ----------------

@Composable
fun ProfileTab(vm: ChildDetailViewModel) {
    TabState(vm.summary, onRetry = vm::loadSummary) { summary ->
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                SectionCard("Student") {
                    val s = summary.student
                    InfoRow("Name", s.fullName)
                    InfoRow("Admission No", s.admissionNo)
                    InfoRow("Class", s.className)
                    InfoRow("Section", s.section)
                    InfoRow("Roll No", s.rollNo)
                    InfoRow("House", s.house)
                    InfoRow("Status", s.studentStatus)
                }
            }
            item {
                SectionCard("Current Year") {
                    InfoRow("Academic Year", summary.currentAcademicYear)
                    summary.currentEnrollment?.let { e ->
                        InfoRow("Enrolled Class", e.className)
                        InfoRow("Enrolled Section", e.section)
                        InfoRow("Roll No", e.rollNo)
                    }
                }
            }
            summary.guardian?.let { g ->
                item {
                    SectionCard("Guardians") {
                        InfoRow("Father", g.fatherName)
                        InfoRow("Mother", g.motherName)
                        InfoRow("Guardian", g.guardianName)
                    }
                }
            }
        }
    }
}

// ---------------- Attendance ----------------

@Composable
fun AttendanceTab(vm: ChildDetailViewModel) {
    TabState(
        state = vm.attendance,
        onRetry = vm::loadAttendance,
        isEmpty = { it.totalDays == 0 && it.records.isEmpty() },
        emptyText = "No attendance recorded yet.",
    ) { data ->
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { AttendanceSummaryCard(data) }
            items(data.records) { rec ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(rec.date ?: "—", style = MaterialTheme.typography.bodyMedium)
                    StatusPill(rec.status)
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
            }
        }
    }
}

@Composable
private fun AttendanceSummaryCard(data: AttendanceResponse) {
    SectionCard("Overview") {
        Row(
            Modifier.fillMaxWidth().padding(top = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Stat("Present", data.counts.present.toString())
            Stat("Absent", data.counts.absent.toString())
            Stat("Late", data.counts.late.toString())
            Stat("Attendance", percent(data.attendancePercentage))
        }
    }
}

@Composable
private fun Stat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun StatusPill(status: String?) {
    val (bg, fg) = when (status) {
        "Present" -> Color(0xFFDCFCE7) to Color(0xFF15803D)
        "Absent" -> Color(0xFFFEE2E2) to Color(0xFFB91C1C)
        "Late" -> Color(0xFFFEF3C7) to Color(0xFFB45309)
        "Half Day" -> Color(0xFFE0E7FF) to Color(0xFF4338CA)
        else -> Color(0xFFE5E7EB) to Color(0xFF374151)
    }
    Box(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .padding(horizontal = 12.dp, vertical = 4.dp),
    ) {
        Text(
            status ?: "—",
            color = fg,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

// ---------------- Marks ----------------

@Composable
fun MarksTab(vm: ChildDetailViewModel) {
    TabState(
        state = vm.marks,
        onRetry = vm::loadMarks,
        isEmpty = { it.exams.isEmpty() },
        emptyText = "No exam results published yet.",
    ) { data ->
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(data.exams) { exam -> ExamCard(exam) }
        }
    }
}

@Composable
private fun ExamCard(exam: ExamResult) {
    SectionCard(exam.examName ?: "Exam") {
        Spacer(Modifier.height(4.dp))
        exam.subjects.forEach { subject ->
            Row(
                Modifier.fillMaxWidth().padding(vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(subject.subject ?: "—", style = MaterialTheme.typography.bodyMedium)
                Row {
                    Text(
                        "${fmt(subject.marksObtained)} / ${fmt(subject.maxMarks)}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                    subject.grade?.takeIf { it.isNotBlank() }?.let {
                        Spacer(Modifier.width(8.dp))
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
        HorizontalDivider(
            Modifier.padding(vertical = 8.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
        )
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                "Total ${fmt(exam.totalObtained)} / ${fmt(exam.totalMax)}",
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                percent(exam.percentage),
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

private fun fmt(v: Double?): String {
    if (v == null) return "—"
    return if (v % 1.0 == 0.0) v.toInt().toString() else v.toString()
}
