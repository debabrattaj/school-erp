package com.schoolerp.portal.network

import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.MediaType
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody
import retrofit2.Converter
import retrofit2.Retrofit
import java.lang.reflect.Type

/**
 * Minimal Retrofit converter backed by kotlinx.serialization, so we don't depend
 * on any third-party converter artifact (only kotlinx-serialization-json + the
 * Retrofit core). Uses reflective serializer lookup for the requested [Type].
 */
class KotlinxJsonConverterFactory(
    private val json: Json,
    private val contentType: MediaType,
) : Converter.Factory() {

    override fun responseBodyConverter(
        type: Type,
        annotations: Array<out Annotation>,
        retrofit: Retrofit,
    ): Converter<ResponseBody, *> {
        val loader = json.serializersModule.serializer(type)
        return Converter<ResponseBody, Any?> { body ->
            body.use { json.decodeFromString(loader, it.string()) }
        }
    }

    override fun requestBodyConverter(
        type: Type,
        parameterAnnotations: Array<out Annotation>,
        methodAnnotations: Array<out Annotation>,
        retrofit: Retrofit,
    ): Converter<*, RequestBody> {
        val saver = json.serializersModule.serializer(type)
        return Converter<Any?, RequestBody> { value ->
            json.encodeToString(saver, value).toRequestBody(contentType)
        }
    }
}
