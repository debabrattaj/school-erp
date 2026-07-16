package com.schoolerp.portal

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.schoolerp.portal.ui.AppNavigation
import com.schoolerp.portal.ui.theme.SchoolPortalTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SchoolPortalTheme {
                AppNavigation()
            }
        }
    }
}
