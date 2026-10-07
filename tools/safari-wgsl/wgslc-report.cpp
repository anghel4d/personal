// wgslc-report: runs WebKit's WGSL compiler (WGSLCore) the way WebKit's WebGPU
// implementation does for a page, and prints every warning and error.
//
//   Device::createShaderModule  -> WGSL::staticCheck with the device's limits
//                                  (WebGPU defaults unless the page asked for more)
//   prepareLibrary (Pipeline.mm) -> WGSL::prepare(ast, entryPoint, nullptr) for
//                                  layout: "auto", one entry point at a time
//                                -> WGSL::generate(..., DeviceState { appleGPUFamily })
//
// Unlike Tools' wgslc, it also prints the warnings that staticCheck returns
// (which WebKit hands to GPUShaderModule.getCompilationInfo()).
//
// Usage: wgslc-report [--apple-gpu-family=N] [--wgslc-config] [--dump-msl=PATH]
//                     <file.wgsl> [entrypoint ...]

#include "config.h"
#if __has_include("WGSLPrefix.h")
#include "WGSLPrefix.h"
#endif

#include "WGSL.h"
#include "WGSLShaderModule.h"
#include "CallGraph.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <wtf/DataLog.h>
#include <wtf/FileSystem.h>
#include <wtf/MainThread.h>
#include <wtf/StringPrintStream.h>

#pragma clang diagnostic ignored "-Wunsafe-buffer-usage"

static std::vector<std::string> splitLines(const std::string& s)
{
    std::vector<std::string> lines;
    size_t start = 0;
    while (true) {
        size_t nl = s.find('\n', start);
        if (nl == std::string::npos) {
            lines.push_back(s.substr(start));
            break;
        }
        lines.push_back(s.substr(start, nl - start));
        start = nl + 1;
    }
    return lines;
}

static void printMessage(const char* kind, const WGSL::CompilationMessage& message, const std::vector<std::string>& lines)
{
    unsigned line = message.lineNumber();
    unsigned column = message.lineOffset();
    printf("%s %u:%u (line %u, column %u): %s\n", kind, line, column, line, column + 1, message.message().utf8().toStdString().c_str());
    if (line >= 1 && line <= lines.size()) {
        const std::string& text = lines[line - 1];
        printf("    | %s\n", text.c_str());
        std::string caret(column < text.size() ? column : text.size(), ' ');
        for (size_t i = 0; i < caret.size(); ++i) {
            if (text[i] == '\t')
                caret[i] = '\t';
        }
        unsigned length = message.length() ? message.length() : 1;
        if (column + length > text.size() && text.size() > column)
            length = text.size() - column;
        caret += std::string(std::max(1u, length), '^');
        printf("    | %s\n", caret.c_str());
    } else
        printf("    (no source position)\n");
}

static const char* stageName(WGSL::ShaderStage stage)
{
    switch (stage) {
    case WGSL::ShaderStage::Vertex: return "vertex";
    case WGSL::ShaderStage::Fragment: return "fragment";
    case WGSL::ShaderStage::Compute: return "compute";
    }
    return "?";
}

int main(int argc, char** argv)
{
    WTF::initializeMainThread();

    unsigned appleGPUFamily = 8;
    bool wgslcConfig = false;
    const char* dumpPath = nullptr;
    const char* file = nullptr;
    std::vector<std::string> requested;
    for (int i = 1; i < argc; ++i) {
        const char* arg = argv[i];
        if (!strncmp(arg, "--apple-gpu-family=", 19))
            appleGPUFamily = atoi(arg + 19);
        else if (!strcmp(arg, "--wgslc-config"))
            wgslcConfig = true;
        else if (!strncmp(arg, "--dump-msl=", 11))
            dumpPath = arg + 11;
        else if (!file)
            file = arg;
        else
            requested.push_back(arg);
    }
    if (!file) {
        fprintf(stderr, "Usage: wgslc-report [--apple-gpu-family=N] [--wgslc-config] [--dump-msl=PATH] <file.wgsl> [entrypoint ...]\n");
        return 2;
    }

    auto readResult = FileSystem::readEntireFile(String::fromLatin1(file));
    if (!readResult) {
        printf("cannot read %s\n", file);
        return 2;
    }
    String source = String::fromUTF8WithLatin1Fallback(readResult->span());
    std::string sourceUTF8 = source.utf8().toStdString();
    auto lines = splitLines(sourceUTF8);

    // WebKit: Device::createShaderModule (ShaderModule.mm). Device limits are the
    // WebGPU defaults for a device requested without requiredLimits
    // (HardwareCapabilities.mm defaultLimits()): maxBindGroupsPlusVertexBuffers 24,
    // maxBindGroups 4, maxComputeWorkgroupStorageSize 16384. The page requests only
    // "timestamp-query", which no WGSL extension maps to.
    WGSL::Configuration configuration = wgslcConfig
        ? WGSL::Configuration { .supportedFeatures { "shader-f16"_s, "clip-distances"_s, "subgroups"_s } }
        : WGSL::Configuration {
            .maxBuffersPlusVertexBuffersForVertexStage = 24,
            .maxBuffersForFragmentStage = 4,
            .maxBuffersForComputeStage = 4,
            .maximumCombinedWorkgroupVariablesSize = 16384,
            .supportedFeatures { "timestamp-query"_s },
        };

    printf("== %s (apple-gpu-family=%u, %s limits)\n", file, appleGPUFamily, wgslcConfig ? "wgslc" : "WebGPU default device");

    auto checkResult = WGSL::staticCheck(source, std::nullopt, configuration);
    if (auto* failed = std::get_if<WGSL::FailedCheck>(&checkResult)) {
        printf("staticCheck: FAILED (%zu error(s), %zu warning(s))\n", failed->errors.size(), failed->warnings.size());
        for (auto& warning : failed->warnings)
            printMessage("warning", warning, lines);
        for (auto& error : failed->errors)
            printMessage("error", error, lines);
        return 1;
    }

    auto& success = std::get<WGSL::SuccessfulCheck>(checkResult);
    printf("staticCheck: OK (%zu warning(s))\n", success.warnings.size());
    for (auto& warning : success.warnings)
        printMessage("warning", warning, lines);

    auto& shaderModule = success.ast.get();

    struct Entry { String name; const char* stage; };
    std::vector<Entry> entries;
    for (auto& entryPoint : shaderModule.callGraph().entrypoints())
        entries.push_back({ entryPoint.originalName, stageName(entryPoint.stage) });

    printf("entry points:");
    for (auto& entry : entries)
        printf(" %s(%s)", entry.name.utf8().toStdString().c_str(), entry.stage);
    printf("\n");

    std::vector<Entry> toRun;
    if (requested.empty())
        toRun = entries;
    else {
        for (auto& name : requested) {
            String wanted = String::fromUTF8(name.c_str());
            const char* stage = nullptr;
            for (auto& entry : entries) {
                if (entry.name == wanted)
                    stage = entry.stage;
            }
            if (!stage) {
                printf("entry %s: NOT FOUND in module\n", name.c_str());
                return 1;
            }
            toRun.push_back({ wanted, stage });
        }
    }

    int status = 0;
    FILE* dump = nullptr;
    if (dumpPath)
        dump = fopen(dumpPath, "w");

    for (auto& entry : toRun) {
        std::string name = entry.name.utf8().toStdString();
        // WebKit: prepareLibrary (Pipeline.mm) with layout: "auto" -> no pipeline layout.
        auto prepareResult = WGSL::prepare(shaderModule, entry.name, nullptr);
        if (auto* error = std::get_if<WGSL::Error>(&prepareResult)) {
            printf("entry %s (%s): prepare FAILED\n", name.c_str(), entry.stage);
            printMessage("error", *error, lines);
            status = 1;
            continue;
        }
        auto& result = std::get<WGSL::PrepareResult>(prepareResult);
        auto it = result.entryPoints.find(entry.name);
        if (it == result.entryPoints.end()) {
            printf("entry %s (%s): prepare returned no entry point information\n", name.c_str(), entry.stage);
            status = 1;
            continue;
        }
        auto& info = it->value;
        printf("entry %s (%s): prepare OK (mangled %s, bindings %zu, workgroup storage %zu bytes, overrides %u)\n",
            name.c_str(), entry.stage, info.mangledName.utf8().toStdString().c_str(), info.bindingCount, info.sizeForWorkgroupVariables, info.specializationConstants.size());
        if (info.defaultLayout) {
            for (auto& group : info.defaultLayout->bindGroupLayouts) {
                for (auto& layoutEntry : group.entries) {
                    const char* kind = WTF::switchOn(layoutEntry.bindingMember,
                        [](const WGSL::BufferBindingLayout& b) {
                            return b.type == WGSL::BufferBindingType::Uniform ? "uniform buffer" : b.type == WGSL::BufferBindingType::Storage ? "storage buffer" : "read-only storage buffer";
                        },
                        [](const WGSL::SamplerBindingLayout& s) {
                            return s.type == WGSL::SamplerBindingType::Filtering ? "filtering sampler" : s.type == WGSL::SamplerBindingType::NonFiltering ? "non-filtering sampler" : "comparison sampler";
                        },
                        [](const WGSL::TextureBindingLayout& t) {
                            switch (t.sampleType) {
                            case WGSL::TextureSampleType::Float: return "texture (float)";
                            case WGSL::TextureSampleType::UnfilterableFloat: return "texture (unfilterable-float)";
                            case WGSL::TextureSampleType::Depth: return "texture (depth)";
                            case WGSL::TextureSampleType::SignedInt: return "texture (sint)";
                            case WGSL::TextureSampleType::UnsignedInt: return "texture (uint)";
                            }
                            return "texture";
                        },
                        [](const WGSL::StorageTextureBindingLayout&) { return "storage texture"; },
                        [](const WGSL::ExternalTextureBindingLayout&) { return "external texture"; });
                    printf("    auto layout: group %u binding %u: %s\n", group.group, layoutEntry.webBinding, kind);
                }
            }
        }

        HashMap<String, WGSL::ConstantValue> constantValues;
        auto generationResult = WGSL::generate(shaderModule, result, constantValues, WGSL::DeviceState {
            .appleGPUFamily = appleGPUFamily,
            .shaderValidationEnabled = false,
        });
        if (auto* error = std::get_if<WGSL::Error>(&generationResult)) {
            printf("entry %s (%s): generate FAILED\n", name.c_str(), entry.stage);
            printMessage("error", *error, lines);
            status = 1;
            continue;
        }
        auto& msl = std::get<String>(generationResult);
        std::string mslUTF8 = msl.utf8().toStdString();
        printf("entry %s (%s): generate OK (%zu bytes of Metal)\n", name.c_str(), entry.stage, mslUTF8.size());
        if (dump) {
            fprintf(dump, "// ===== entry point %s (%s), apple-gpu-family=%u =====\n", name.c_str(), entry.stage, appleGPUFamily);
            fwrite(mslUTF8.data(), 1, mslUTF8.size(), dump);
            fprintf(dump, "\n");
        }
    }
    if (dump)
        fclose(dump);
    printf("result: %s\n", status ? "FAILED" : "OK");
    return status;
}
