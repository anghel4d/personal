// Compiles SPIR-V pipelines with RADV's null device (RADV_FORCE_FAMILY) and prints ACO's statistics per executable.
// Manifest on stdin:
//   P <name> C <cs.spv> <entry>
//   P <name> G <vs.spv> <vsEntry> <fs.spv> <fsEntry> <vkFormat> <blendAdd> <cullBack> <frontCW> <vbStride>
//   B <set> <binding> <descriptorType> <stageFlags>      (any number)
//   E
#include <vulkan/vulkan.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CK(x) do { VkResult r_ = (x); if (r_ != VK_SUCCESS) { fprintf(stderr, "%s failed: %d\n", #x, r_); exit(1); } } while (0)
static VkDevice dev;
static PFN_vkGetPipelineExecutablePropertiesKHR getProps;
static PFN_vkGetPipelineExecutableStatisticsKHR getStats;
static uint32_t *readFile(const char *p, size_t *n) {
  FILE *f = fopen(p, "rb"); if (!f) { fprintf(stderr, "no %s\n", p); exit(1); }
  fseek(f, 0, SEEK_END); *n = ftell(f); fseek(f, 0, SEEK_SET);
  uint32_t *b = malloc(*n); if (fread(b, 1, *n, f) != *n) exit(1); fclose(f); return b;
}
static VkShaderModule mod(const char *p) {
  size_t n; uint32_t *c = readFile(p, &n);
  VkShaderModuleCreateInfo ci = { VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO, 0, 0, n, c };
  VkShaderModule m; CK(vkCreateShaderModule(dev, &ci, 0, &m)); free(c); return m;
}
static void report(const char *name, VkPipeline p) {
  VkPipelineInfoKHR pi = { VK_STRUCTURE_TYPE_PIPELINE_INFO_KHR, 0, p };
  uint32_t n = 0; CK(getProps(dev, &pi, &n, 0));
  VkPipelineExecutablePropertiesKHR *pr = calloc(n, sizeof *pr);
  for (uint32_t i = 0; i < n; i++) pr[i].sType = VK_STRUCTURE_TYPE_PIPELINE_EXECUTABLE_PROPERTIES_KHR;
  CK(getProps(dev, &pi, &n, pr));
  for (uint32_t i = 0; i < n; i++) {
    VkPipelineExecutableInfoKHR ei = { VK_STRUCTURE_TYPE_PIPELINE_EXECUTABLE_INFO_KHR, 0, p, i };
    uint32_t m = 0; CK(getStats(dev, &ei, &m, 0));
    VkPipelineExecutableStatisticKHR *st = calloc(m, sizeof *st);
    for (uint32_t k = 0; k < m; k++) st[k].sType = VK_STRUCTURE_TYPE_PIPELINE_EXECUTABLE_STATISTIC_KHR;
    CK(getStats(dev, &ei, &m, st));
    printf("%s\t%s\tsubgroup %u", name, pr[i].name, pr[i].subgroupSize);
    for (uint32_t k = 0; k < m; k++) {
      printf("\t%s=", st[k].name);
      switch (st[k].format) {
        case VK_PIPELINE_EXECUTABLE_STATISTIC_FORMAT_BOOL32_KHR: printf("%u", st[k].value.b32); break;
        case VK_PIPELINE_EXECUTABLE_STATISTIC_FORMAT_INT64_KHR: printf("%lld", (long long)st[k].value.i64); break;
        case VK_PIPELINE_EXECUTABLE_STATISTIC_FORMAT_UINT64_KHR: printf("%llu", (unsigned long long)st[k].value.u64); break;
        case VK_PIPELINE_EXECUTABLE_STATISTIC_FORMAT_FLOAT64_KHR: printf("%g", st[k].value.f64); break;
        default: printf("?");
      }
    }
    printf("\n"); free(st);
  }
  free(pr); fflush(stdout);
}
int main(void) {
  VkApplicationInfo ai = { VK_STRUCTURE_TYPE_APPLICATION_INFO, 0, "radvstats", 1, 0, 0, VK_API_VERSION_1_3 };
  VkInstanceCreateInfo ici = { VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO, 0, 0, &ai };
  VkInstance inst; CK(vkCreateInstance(&ici, 0, &inst));
  uint32_t np = 0; CK(vkEnumeratePhysicalDevices(inst, &np, 0)); if (!np) { fprintf(stderr, "no device\n"); return 1; }
  VkPhysicalDevice pds[8]; np = np > 8 ? 8 : np; CK(vkEnumeratePhysicalDevices(inst, &np, pds));
  VkPhysicalDeviceProperties pp; vkGetPhysicalDeviceProperties(pds[0], &pp); fprintf(stderr, "device: %s\n", pp.deviceName);
  float prio = 1; VkDeviceQueueCreateInfo q = { VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO, 0, 0, 0, 1, &prio };
  VkPhysicalDevicePipelineExecutablePropertiesFeaturesKHR fx = { VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_PIPELINE_EXECUTABLE_PROPERTIES_FEATURES_KHR, 0, VK_TRUE };
  VkPhysicalDeviceVulkan13Features f13 = { VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES, &fx };
  f13.dynamicRendering = VK_TRUE;
  VkPhysicalDeviceFeatures2 f2 = { VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2, &f13 };
  f2.features.samplerAnisotropy = VK_TRUE; f2.features.shaderStorageImageWriteWithoutFormat = VK_TRUE;
  f2.features.shaderStorageImageReadWithoutFormat = VK_TRUE; f2.features.fragmentStoresAndAtomics = VK_TRUE;
  const char *ext[] = { VK_KHR_PIPELINE_EXECUTABLE_PROPERTIES_EXTENSION_NAME };
  VkDeviceCreateInfo dci = { VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO, &f2, 0, 1, &q, 0, 0, 1, ext, 0 };
  CK(vkCreateDevice(pds[0], &dci, 0, &dev));
  getProps = (void *)vkGetDeviceProcAddr(dev, "vkGetPipelineExecutablePropertiesKHR");
  getStats = (void *)vkGetDeviceProcAddr(dev, "vkGetPipelineExecutableStatisticsKHR");
  char line[4096];
  char name[256] = "", kind = 0, a[1024], b[256], c[1024], d[256];
  int fmt = 0, blendAdd = 0, cull = 0, cw = 0, stride = 0;
  VkDescriptorSetLayoutBinding binds[4][32]; int nb[4] = { 0 }, nsets = 0;
  while (fgets(line, sizeof line, stdin)) {
    if (line[0] == 'P') {
      memset(nb, 0, sizeof nb); nsets = 0;
      char k[8]; sscanf(line, "P %255s %7s", name, k); kind = k[0];
      if (kind == 'C') sscanf(line, "P %*s C %1023s %255s", a, b);
      else sscanf(line, "P %*s G %1023s %255s %1023s %255s %d %d %d %d %d", a, b, c, d, &fmt, &blendAdd, &cull, &cw, &stride);
    } else if (line[0] == 'B') {
      int s, bi, t, st; sscanf(line, "B %d %d %d %d", &s, &bi, &t, &st);
      binds[s][nb[s]++] = (VkDescriptorSetLayoutBinding){ bi, t, 1, st, 0 };
      if (s + 1 > nsets) nsets = s + 1;
    } else if (line[0] == 'E') {
      VkDescriptorSetLayout sl[4];
      for (int s = 0; s < nsets; s++) {
        VkDescriptorSetLayoutCreateInfo lci = { VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO, 0, 0, nb[s], binds[s] };
        CK(vkCreateDescriptorSetLayout(dev, &lci, 0, &sl[s]));
      }
      VkPipelineLayoutCreateInfo plci = { VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO, 0, 0, nsets, sl };
      VkPipelineLayout pl; CK(vkCreatePipelineLayout(dev, &plci, 0, &pl));
      VkPipeline p;
      if (kind == 'C') {
        VkComputePipelineCreateInfo cci = { VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO, 0, VK_PIPELINE_CREATE_CAPTURE_STATISTICS_BIT_KHR,
          { VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO, 0, 0, VK_SHADER_STAGE_COMPUTE_BIT, mod(a), b }, pl };
        CK(vkCreateComputePipelines(dev, 0, 1, &cci, 0, &p));
      } else {
        VkPipelineShaderStageCreateInfo stg[2] = {
          { VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO, 0, 0, VK_SHADER_STAGE_VERTEX_BIT, mod(a), b },
          { VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO, 0, 0, VK_SHADER_STAGE_FRAGMENT_BIT, mod(c), d } };
        VkVertexInputBindingDescription vb = { 0, stride, VK_VERTEX_INPUT_RATE_VERTEX };
        VkVertexInputAttributeDescription va = { 0, 0, VK_FORMAT_R32G32_SFLOAT, 0 };
        VkPipelineVertexInputStateCreateInfo vi = { VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO, 0, 0, stride ? 1 : 0, &vb, stride ? 1 : 0, &va };
        VkPipelineInputAssemblyStateCreateInfo ia = { VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO, 0, 0, VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST };
        VkPipelineViewportStateCreateInfo vp = { VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO, 0, 0, 1, 0, 1, 0 };
        VkPipelineRasterizationStateCreateInfo rs = { VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO };
        rs.polygonMode = VK_POLYGON_MODE_FILL; rs.cullMode = cull ? VK_CULL_MODE_BACK_BIT : VK_CULL_MODE_NONE;
        rs.frontFace = cw ? VK_FRONT_FACE_CLOCKWISE : VK_FRONT_FACE_COUNTER_CLOCKWISE; rs.lineWidth = 1;
        VkPipelineMultisampleStateCreateInfo ms = { VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO, 0, 0, VK_SAMPLE_COUNT_1_BIT };
        VkPipelineColorBlendAttachmentState ba = { blendAdd, VK_BLEND_FACTOR_ONE, VK_BLEND_FACTOR_ONE, VK_BLEND_OP_ADD,
          VK_BLEND_FACTOR_ONE, VK_BLEND_FACTOR_ONE, VK_BLEND_OP_ADD, 0xF };
        VkPipelineColorBlendStateCreateInfo cb = { VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO, 0, 0, 0, 0, 1, &ba };
        VkDynamicState dyn[2] = { VK_DYNAMIC_STATE_VIEWPORT, VK_DYNAMIC_STATE_SCISSOR };
        VkPipelineDynamicStateCreateInfo ds = { VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO, 0, 0, 2, dyn };
        VkFormat cf = fmt;
        VkPipelineRenderingCreateInfo ri = { VK_STRUCTURE_TYPE_PIPELINE_RENDERING_CREATE_INFO, 0, 0, 1, &cf };
        VkGraphicsPipelineCreateInfo gci = { VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO, &ri, VK_PIPELINE_CREATE_CAPTURE_STATISTICS_BIT_KHR,
          2, stg, &vi, &ia, 0, &vp, &rs, &ms, 0, &cb, &ds, pl };
        CK(vkCreateGraphicsPipelines(dev, 0, 1, &gci, 0, &p));
      }
      report(name, p);
    }
  }
  return 0;
}
