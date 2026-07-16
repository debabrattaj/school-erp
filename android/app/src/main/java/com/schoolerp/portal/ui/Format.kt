package com.schoolerp.portal.ui

import com.schoolerp.portal.PortalApp
import java.util.Locale

/** Resolve a possibly-relative photo/upload URL against the API base URL. */
fun absoluteUrl(pathOrUrl: String?): String? {
    val p = pathOrUrl?.trim().orEmpty()
    if (p.isEmpty()) return null
    if (p.startsWith("http://") || p.startsWith("https://")) return p
    val base = PortalApp.instance.session.cachedBaseUrl.trimEnd('/')
    return if (p.startsWith("/")) "$base$p" else "$base/$p"
}

/** Currency formatting kept simple and locale-light (school ERP defaults to INR). */
fun money(amount: Double?, currency: String = "INR"): String {
    val value = amount ?: 0.0
    val symbol = when (currency.uppercase(Locale.ROOT)) {
        "INR" -> "₹"
        "USD" -> "$"
        "EUR" -> "€"
        "GBP" -> "£"
        else -> ""
    }
    return symbol + String.format(Locale.ROOT, "%,.2f", value)
}

fun percent(value: Double?): String =
    if (value == null) "—" else String.format(Locale.ROOT, "%.1f%%", value)
