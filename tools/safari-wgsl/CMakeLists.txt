# Shadow top-level project for building WebKit's wgslc (WGSL compiler) on Linux
# without JavaScriptCore. `Source` is a symlink to the WebKit clone's Source/.
# It mirrors WebKit's root CMakeLists.txt and Source/CMakeLists.txt, but only adds
# bmalloc, WTF and WebGPU/WGSL. WGSLCore links WebKit::JavaScriptCore; the WGSL
# sources only use WTF, so a stand-in interface target forwards that to WTF.
cmake_minimum_required(VERSION 3.20)
set(CMAKE_MODULE_PATH "${CMAKE_SOURCE_DIR}/Source/cmake")

project(WebKit LANGUAGES C CXX)

set(CMAKE_PCH_PROLOGUE "")

include(WebKitCommon)

add_subdirectory(Source/bmalloc)
add_subdirectory(Source/WTF)

add_library(JavaScriptCore_StandIn INTERFACE)
target_link_libraries(JavaScriptCore_StandIn INTERFACE WebKit::WTF)
add_library(WebKit::JavaScriptCore ALIAS JavaScriptCore_StandIn)

add_subdirectory(Source/WebGPU/WGSL)

# wgslc-report: same compiler, driven the way WebKit's WebGPU does for a page, and
# printing warnings too (wgslc prints only errors). Source lives next to this file.
if (TARGET WGSLCore)
    add_executable(wgslc-report ${CMAKE_CURRENT_SOURCE_DIR}/wgslc-report.cpp)
    target_link_libraries(wgslc-report PRIVATE WGSLCore)
else ()
    # Older layout: wgslc is one executable compiled from all WGSL sources.
    # Build the driver from the same sources, with wgslc.cpp swapped out.
    set(_wgsl_dir ${CMAKE_SOURCE_DIR}/Source/WebGPU/WGSL)
    get_target_property(_wgslc_sources wgslc SOURCES)
    set(_report_sources ${CMAKE_CURRENT_SOURCE_DIR}/wgslc-report.cpp)
    foreach (_s IN LISTS _wgslc_sources)
        if (_s MATCHES "wgslc\\.cpp$" OR _s MATCHES "cmakeconfig\\.h$")
            continue ()
        endif ()
        if (IS_ABSOLUTE "${_s}")
            list(APPEND _report_sources "${_s}")
        else ()
            list(APPEND _report_sources "${_wgsl_dir}/${_s}")
        endif ()
    endforeach ()
    add_executable(wgslc-report ${_report_sources})
    target_include_directories(wgslc-report PRIVATE
        ${CMAKE_BINARY_DIR}
        ${CMAKE_BINARY_DIR}/Source/WebGPU/WGSL
        ${_wgsl_dir}
        ${_wgsl_dir}/AST
        ${_wgsl_dir}/Metal)
    get_target_property(_libs wgslc LINK_LIBRARIES)
    target_link_libraries(wgslc-report PRIVATE ${_libs})
    get_target_property(_defs wgslc COMPILE_DEFINITIONS)
    if (_defs)
        target_compile_definitions(wgslc-report PRIVATE ${_defs})
    endif ()
    get_target_property(_opts wgslc COMPILE_OPTIONS)
    if (_opts)
        target_compile_options(wgslc-report PRIVATE ${_opts})
    endif ()
    add_dependencies(wgslc-report wgsl-types)
endif ()

PRINT_WEBKIT_OPTIONS()
