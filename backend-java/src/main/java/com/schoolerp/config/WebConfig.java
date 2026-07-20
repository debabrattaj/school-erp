package com.schoolerp.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.File;

/** Serves the uploads directory at /uploads/**, matching main.py's app.mount("/uploads", StaticFiles(...)). */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final SchoolErpProperties properties;

    public WebConfig(SchoolErpProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String dir = new File(properties.getUploads().getDir()).getAbsolutePath();
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:" + dir + File.separator);
    }
}
