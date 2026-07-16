package com.schoolerp.portal.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.schoolerp.portal.ui.screens.ChildDetailScreen
import com.schoolerp.portal.ui.screens.ChildrenScreen
import com.schoolerp.portal.ui.screens.LoginScreen

private object Routes {
    const val LOGIN = "login"
    const val CHILDREN = "children"
    const val CHILD = "child/{id}/{name}"
    fun child(id: Int, name: String) = "child/$id/${java.net.URLEncoder.encode(name, "UTF-8")}"
}

@Composable
fun AppNavigation(appVm: AppViewModel = viewModel()) {
    val session by appVm.session.collectAsStateWithLifecycle()
    val navController = rememberNavController()

    // Wait for the persisted session to load before choosing a start screen.
    if (session == null) return

    val start = if (session!!.isLoggedIn) Routes.CHILDREN else Routes.LOGIN

    Surface(Modifier.fillMaxSize()) {
        NavHost(navController = navController, startDestination = start) {
            composable(Routes.LOGIN) {
                LoginScreen(
                    onLoggedIn = {
                        navController.navigate(Routes.CHILDREN) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    },
                )
            }
            composable(Routes.CHILDREN) {
                ChildrenScreen(
                    schoolName = session?.schoolName,
                    onOpenChild = { child ->
                        val name = child.fullName
                            ?: listOfNotNull(child.firstName, child.lastName).joinToString(" ")
                        navController.navigate(Routes.child(child.id, name.ifBlank { "Student" }))
                    },
                    onLogout = {
                        appVm.logout()
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                )
            }
            composable(
                route = Routes.CHILD,
                arguments = listOf(
                    navArgument("id") { type = NavType.IntType },
                    navArgument("name") { type = NavType.StringType },
                ),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getInt("id") ?: return@composable
                val name = backStackEntry.arguments?.getString("name")
                    ?.let { java.net.URLDecoder.decode(it, "UTF-8") } ?: "Student"
                ChildDetailScreen(
                    studentId = id,
                    childName = name,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}
