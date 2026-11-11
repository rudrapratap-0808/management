import math, random, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H, FPS = 1920, 1080, 24
DUR = 249.88
NF = int(round(DUR * FPS))
IMG = {}
def img(n):
    if n not in IMG:
        IMG[n] = Image.open(f"/tmp/a/img/{n}.png").convert("RGB")
    return IMG[n]

# shot: (start, end, image, (cx,cy,zoom) from, (cx,cy,zoom) to, grade, fx, xfade_in)
# zoom 1.0 = full frame; cx/cy normalized centre.
SH = [
    (0, 8, "S01", (.5, .5, 1.0), (.42, .55, 1.18), "warm", "dust", 0),
    (8, 14, "S02", (.45, .45, 1.05), (.55, .5, 1.18), "warm", "dust", 1.2),
    (14, 20, "S03", (.38, .5, 1.2), (.62, .5, 1.2), "warm", "dust", 1.2),
    (20, 28, "S04", (.4, .5, 1.12), (.66, .45, 1.35), "warm", "dust", 1.2),
    (28, 34, "S05", (.5, .5, 1.0), (.58, .42, 1.2), "warm", "dust", 0.8),
    (34, 40, "S06", (.45, .8, 1.9), (.5, .5, 1.0), "warm", "dust", 1.0),
    (40, 46, "S07", (.4, .5, 1.12), (.6, .5, 1.12), "warm", "dust", 1.5),
    (46, 53, "S08", (.38, .5, 1.1), (.55, .5, 1.1), "warm", "leaves", 1.2),
    (53, 65, "S09", (.26, .5, 1.85), (.5, .5, 1.0), "", "dust", 1.5),
    (65, 71, "S10a", (.5, .5, 1.0), (.55, .45, 1.15), "warm", "leaves", 0.6),
    (71, 77, "S10b", (.5, .5, 1.0), (.5, .45, 1.15), "warm", "dust", 0.8),
    (77, 83, "S10c", (.52, .5, 1.0), (.52, .45, 1.22), "", "leaves", 0),
    (83, 90, "S10d", (.45, .55, 1.25), (.4, .55, 1.5), "warm", "leaves", 0),
    (90, 104, "S11", (.5, .5, 1.0), (.47, .5, 1.25), "", "dust", 1.5),
    (104, 114, "S12", (.5, .5, 1.0), (.6, .5, 1.15), "", "rain", 1.5),
    (114, 121, "S13", (.55, .5, 1.05), (.55, .55, 1.35), "warm", "leaves", 1.2),
    (121, 127, "S14", (.25, .5, 1.45), (.75, .5, 1.45), "", "rain", 1.0),
    (127, 133, "S15", (.5, .5, 1.0), (.5, .4, 1.15), "warm", "", 1.0),
    (133, 141, "S16", (.45, .5, 1.0), (.42, .4, 1.25), "", "rain", 1.2),
    (141, 154, "S17", (.5, .5, 1.0), (.45, .45, 1.25), "", "dust", 1.5),
    (154, 160, "S18", (.5, .5, 1.0), (.45, .45, 1.3), "", "dust", 1.5),
    (160, 166.5, "S18", (.36, .32, 1.9), (.34, .3, 2.25), "dim", "dust", 0.6),
    (166.5, 169.5, "S07", (.5, .5, 1.1), (.5, .5, 1.25), "bright", "dust", 0.3),   # S19a montage
    (169.5, 172.5, "S10a", (.5, .5, 1.15), (.5, .45, 1.3), "bright", "leaves", 0.3),
    (172.5, 175.5, "S15", (.5, .45, 1.1), (.5, .4, 1.25), "bright", "leaves", 0.3),
    (175.5, 178, "S13", (.5, .5, 1.1), (.5, .5, 1.25), "bright", "dust", 0.3),
    (178, 184, "S19b", (.22, .3, 2.2), (.7, .5, 1.25), "", "lights", 0.4),
    (184, 191, "S19c", (.5, .5, 1.0), (.42, .5, 1.12), "", "leaves", 0.8),
    (191, 206, "S20", (.4, .5, 1.25), (.48, .5, 1.0), "", "swirl", 1.0),
    (206, 217, "S21", (.5, .5, 1.0), (.55, .55, 1.2), "", "dust", 1.5),
    (217, 230, "S22", (.62, .5, 1.25), (.5, .42, 1.05), "", "dust", 1.2),
    (230, 236, "S23", (.5, .5, 1.0), (.5, .4, 1.15), "warm", "dust", 1.0),
    (236, 246, "S24", (.3, .78, 1.6), (.5, .5, 1.0), "warm", "rise", 1.5),
    (246, DUR + 0.1, "S25", (.5, .5, 1.12), (.5, .5, 1.0), "", "", 1.8),
]

def ease(p):
    return p * p * (3 - 2 * p)

def grade(a, g):
    if g == "warm":
        return a * np.array([1.04, 1.0, 0.94], np.float32)
    if g == "bright":
        return np.minimum(255, a * np.array([1.1, 1.05, 0.96], np.float32) + 6)
    if g in ("cold", "grey"):
        lum = a.mean(axis=2, keepdims=True)
        k = 0.55 if g == "cold" else 0.3
        out = a * k + lum * (1 - k)
        return out * np.array([0.93, 0.93, 0.97] if g == "cold" else [0.86, 0.86, 0.9], np.float32)
    if g == "night":
        return a * np.array([0.62, 0.5, 0.42], np.float32)
    if g == "dim":
        return a * np.array([0.82, 0.74, 0.66], np.float32)
    return a

def frame(shot, t):
    s0, s1, n, a, b, g, _, _ = shot
    p = ease(min(1, max(0, (t - s0) / (s1 - s0))))
    cx, cy, z = (a[i] + (b[i] - a[i]) * p for i in range(3))
    im = img(n); iw, ih = im.size
    cw, ch = iw / z, ih / z
    x0 = min(max(cx * iw - cw / 2, 0), iw - cw); y0 = min(max(cy * ih - ch / 2, 0), ih - ch)
    fr = np.asarray(im.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch)), np.float32)
    return grade(fr, g)

random.seed(3)
LEAF_C = [(214, 120, 40), (232, 170, 60), (180, 84, 34), (240, 196, 100)]
leaves = [[random.uniform(0, W), random.uniform(-H, H), random.uniform(0, 6.28), random.uniform(9, 18), random.choice(LEAF_C)] for _ in range(34)]
dust = [[random.uniform(0, W), random.uniform(0, H), random.uniform(1.5, 4)] for _ in range(80)]
rain = [[random.uniform(0, W), random.uniform(0, H), random.uniform(26, 50)] for _ in range(320)]
lights = [[random.uniform(0, W), random.uniform(H * 0.5, H), random.uniform(4, 9), random.uniform(0, 6)] for _ in range(70)]

def overlay(fx, t, dt):
    if not fx:
        return None
    ov = Image.new("RGBA", (W, H), (255, 220, 160, 0)); d = ImageDraw.Draw(ov)
    if fx in ("leaves", "swirl", "rise"):
        for L in leaves:
            if fx == "rise":
                L[1] -= 70 * dt; L[0] += 30 * math.sin(t + L[2]) * dt
                if L[1] < -30: L[1] = H + 30; L[0] = random.uniform(0, W)
            else:
                sp = 110 if fx == "swirl" else 55
                L[1] += sp * dt; L[0] += (110 if fx == "swirl" else 25) * math.sin(t * 0.8 + L[2]) * dt
                if L[1] > H + 30: L[1] = -30; L[0] = random.uniform(0, W)
            an = t * 1.5 + L[2]; r = L[3]
            dx, dy = abs(math.cos(an)) * r + 2, abs(math.sin(an)) * r * 0.45 + 2
            d.ellipse([L[0] - dx, L[1] - dy, L[0] + dx, L[1] + dy], fill=L[4] + (200,))
    if fx == "dust":
        for D in dust:
            D[1] -= 8 * dt; D[0] += 6 * math.sin(t + D[2]) * dt
            if D[1] < 0: D[1] = H
            d.ellipse([D[0], D[1], D[0] + D[2], D[1] + D[2]], fill=(255, 236, 190, 110))
    if fx == "rain":
        for R in rain:
            R[1] += 1300 * dt; R[0] -= 170 * dt
            if R[1] > H: R[1] = -60; R[0] = random.uniform(0, W + 300)
            d.line([R[0], R[1], R[0] - R[2] * 0.15, R[1] + R[2]], fill=(225, 218, 205, 95), width=2)
    if fx == "lights":
        for Lg in lights:
            Lg[0] -= 14 * dt
            if Lg[0] < 0: Lg[0] = W
            f = 0.75 + 0.25 * math.sin(t * 6 + Lg[3])
            r = Lg[2] * (Lg[1] / H)
            d.ellipse([Lg[0] - r * 3, Lg[1] - r * 2, Lg[0] + r * 3, Lg[1] + r * 2], fill=(255, 170, 70, int(60 * f)))
            d.ellipse([Lg[0] - r, Lg[1] - r, Lg[0] + r, Lg[1] + r], fill=(255, 226, 150, int(220 * f)))
    if fx in ("leaves", "swirl", "rise"):
        ov = ov.filter(ImageFilter.GaussianBlur(1.2))
    return np.asarray(ov, np.float32)

rng = np.random.default_rng(1)
GRAIN = [rng.normal(0, 3.5, (H, W, 1)).astype(np.float32) for _ in range(6)]
vx = (np.arange(W) - W / 2) / (W / 2); vy = (np.arange(H) - H / 2) / (H / 2)
VIG = (1 - 0.32 * np.clip(vx[None, :] ** 2 + vy[:, None] ** 2 - 0.3, 0, 2) ** 1.2)[..., None].astype(np.float32)

out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/a/tere_khat_film.mp4"
t_end = float(sys.argv[2]) if len(sys.argv) > 2 else DUR
ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                       "-i", "/tmp/a/song.mp3", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                       "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-t", f"{min(t_end, DUR)}", "-movflags", "+faststart", out],
                      stdin=subprocess.PIPE)
dt = 1 / FPS
for fi in range(int(min(t_end, DUR) * FPS)):
    t = fi / FPS
    i = next(k for k, s in enumerate(SH) if s[0] <= t < s[1])
    sh = SH[i]
    fr = frame(sh, t)
    xf = sh[7]
    if i > 0 and xf > 0 and t - sh[0] < xf:
        a = ease((t - sh[0]) / xf)
        fr = fr * a + frame(SH[i - 1], t) * (1 - a)
    oa = overlay(sh[6], t, dt)
    if oa is not None:
        al = oa[..., 3:] / 255
        fr = fr * (1 - al) + oa[..., :3] * al
    if t < 1.5:
        fr *= t / 1.5
    if t > DUR - 1.5:
        fr *= max(0, (DUR - t) / 1.5)
    fr = fr * VIG + GRAIN[fi % 6]
    ff.stdin.write(np.clip(fr, 0, 255).astype(np.uint8).tobytes())
    if fi % 720 == 0:
        print(f"{t:.0f}s", flush=True)
ff.stdin.close(); ff.wait(); print("done", ff.returncode)
