// Integer-only boundary-face extraction. ABI matches solve.py's NumPy reference exactly.
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <vector>

namespace {
struct Face {
    std::int32_t a, b, c;
    std::uint64_t original;
};
bool equal_key(const Face& left, const Face& right) noexcept {
    return left.a == right.a && left.b == right.b && left.c == right.c;
}
}

extern "C" int rb_surface_abi_version() noexcept { return 1; }
extern "C" long rb_surface_cpp_standard() noexcept { return __cplusplus; }

// Return boundary count, -1 invalid arguments/overflow, -2 insufficient output capacity,
// or -3 allocation/internal failure. No exceptions cross the C boundary; no partial output on errors.
extern "C" std::int64_t rb_boundary_faces(const std::int32_t* tets, std::int64_t n_tets,
                                         std::uint64_t* out_face_indices,
                                         std::int64_t out_capacity) noexcept {
    if (n_tets < 0 || out_capacity < 0 || n_tets > std::numeric_limits<std::int64_t>::max() / 4)
        return -1;
    if (n_tets == 0) return 0;
    if (tets == nullptr || (out_capacity > 0 && out_face_indices == nullptr)) return -1;
    const auto count = static_cast<std::uint64_t>(n_tets) * 4;
    if (count > static_cast<std::uint64_t>(std::numeric_limits<std::ptrdiff_t>::max()) / sizeof(std::int32_t)
        || count > std::numeric_limits<std::size_t>::max() / sizeof(Face)) return -1;
    try {
        std::vector<Face> faces;
        if (count > faces.max_size()) return -1;
        faces.reserve(static_cast<std::size_t>(count));
        constexpr int oriented[4][3] = {{1, 2, 3}, {0, 3, 2}, {0, 1, 3}, {0, 2, 1}};
        for (std::int64_t tet = 0; tet < n_tets; ++tet) {
            const auto* vertices = tets + tet * 4;
            for (int face = 0; face < 4; ++face) {
                auto a = vertices[oriented[face][0]];
                auto b = vertices[oriented[face][1]];
                auto c = vertices[oriented[face][2]];
                if (a > b) std::swap(a, b);
                if (b > c) std::swap(b, c);
                if (a > b) std::swap(a, b);
                faces.push_back({a, b, c, static_cast<std::uint64_t>(tet) * 4 + face});
            }
        }
        std::sort(faces.begin(), faces.end(), [](const Face& left, const Face& right) {
            if (left.a != right.a) return left.a < right.a;
            if (left.b != right.b) return left.b < right.b;
            return left.c < right.c;
        });
        std::int64_t boundaries = 0;
        for (std::size_t i = 0; i < faces.size();) {
            auto next = i + 1;
            while (next < faces.size() && equal_key(faces[i], faces[next])) ++next;
            if (next == i + 1) ++boundaries;
            i = next;
        }
        if (boundaries > out_capacity) return -2;
        if (boundaries > 0 && out_face_indices == nullptr) return -1;
        std::size_t output = 0;
        for (std::size_t i = 0; i < faces.size();) {
            auto next = i + 1;
            while (next < faces.size() && equal_key(faces[i], faces[next])) ++next;
            if (next == i + 1) out_face_indices[output++] = faces[i].original;
            i = next;
        }
        return boundaries;
    } catch (...) {
        return -3;
    }
}
