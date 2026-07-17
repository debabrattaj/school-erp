package com.schoolerp.portal.ui.screens

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.schoolerp.portal.ui.ChildDetailViewModel

private val TABS = listOf("Profile", "Attendance", "Marks", "Fees")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChildDetailScreen(
    studentId: Int,
    childName: String,
    onBack: () -> Unit,
) {
    val vm: ChildDetailViewModel = viewModel(
        key = "child-$studentId",
        factory = ChildDetailViewModel.Factory(studentId),
    )
    var selectedTab by rememberSaveable(studentId) { mutableIntStateOf(0) }
    val context = LocalContext.current

    // Lazy-load each tab's data the first time it's shown.
    LaunchedEffect(selectedTab) {
        when (selectedTab) {
            0 -> vm.loadSummary()
            1 -> vm.loadAttendance()
            2 -> vm.loadMarks()
            3 -> vm.loadFees()
        }
    }

    // Surface one-shot payment messages as toasts.
    LaunchedEffect(vm.paymentMessage) {
        vm.paymentMessage?.let {
            Toast.makeText(context, it, Toast.LENGTH_LONG).show()
            vm.clearPaymentMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(childName, fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            androidx.compose.foundation.layout.Column {
                ScrollableTabRow(
                    selectedTabIndex = selectedTab,
                    edgePadding = 12.dp,
                    containerColor = MaterialTheme.colorScheme.surface,
                ) {
                    TABS.forEachIndexed { index, title ->
                        Tab(
                            selected = selectedTab == index,
                            onClick = { selectedTab = index },
                            text = { Text(title) },
                        )
                    }
                }
                when (selectedTab) {
                    0 -> ProfileTab(vm)
                    1 -> AttendanceTab(vm)
                    2 -> MarksTab(vm)
                    3 -> FeesTab(
                        vm = vm,
                        onLaunchUpi = { uri -> launchUpi(context, uri) },
                    )
                }
            }
        }
    }
}

private fun launchUpi(context: android.content.Context, uri: String) {
    try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
        context.startActivity(Intent.createChooser(intent, "Pay with"))
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(
            context,
            "No UPI payment app found on this device.",
            Toast.LENGTH_LONG,
        ).show()
    }
}
