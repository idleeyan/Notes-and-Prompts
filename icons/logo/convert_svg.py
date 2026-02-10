#!/usr/bin/env python3
"""
使用纯Python将SVG转换为PNG，无需外部依赖
"""

import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw
import io
import base64
import os

def parse_svg_color(color_str):
    """解析SVG颜色"""
    color_map = {
        '#667eea': (102, 126, 234),
        '#764ba2': (118, 75, 162),
        '#7c3aed': (124, 58, 237),
        '#ffd700': (255, 215, 0),
        '#ff8c00': (255, 140, 0),
        '#ffa500': (255, 165, 0),
        '#ffd93d': (255, 217, 61),
        '#6c757d': (108, 117, 125),
        '#495057': (73, 80, 87),
        '#4a5568': (74, 85, 104),
        '#2d3748': (45, 55, 72),
        '#5a67d8': (90, 103, 216),
        '#e53e3e': (229, 62, 62),
        '#e2e8f0': (226, 232, 240),
        '#e9ecef': (233, 236, 239),
        '#dee2e6': (222, 226, 230),
        '#f8f9fa': (248, 249, 250),
        'white': (255, 255, 255),
        '#fff3cd': (255, 243, 205),
    }
    return color_map.get(color_str.lower(), (128, 128, 128))

def create_simple_logo(size):
    """创建简化版的LOGO"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 背景圆形渐变（简化）
    center = size // 2
    radius = int(size * 0.45)
    
    # 绘制渐变背景（使用同心圆模拟）
    for r in range(radius, 0, -1):
        ratio = r / radius
        # 从 #667eea 到 #764ba2 的渐变
        r_color = int(102 + (118 - 102) * (1 - ratio))
        g_color = int(126 + (75 - 126) * (1 - ratio))
        b_color = int(234 + (162 - 234) * (1 - ratio))
        draw.ellipse([center - r, center - r, center + r, center + r], 
                     fill=(r_color, g_color, b_color, 255))
    
    # 文档矩形
    doc_width = int(size * 0.4)
    doc_height = int(size * 0.5)
    doc_x = center - doc_width // 2 - int(size * 0.05)
    doc_y = center - doc_height // 2 - int(size * 0.05)
    
    # 白色文档背景
    draw.rounded_rectangle([doc_x, doc_y, doc_x + doc_width, doc_y + doc_height], 
                          radius=int(size * 0.03), fill=(255, 255, 255, 242))
    
    # 文档线条
    line_width = int(doc_width * 0.7)
    line_height = max(2, int(size * 0.025))
    line_x = doc_x + int(doc_width * 0.15)
    
    # 线条1 - 紫色
    line_y = doc_y + int(doc_height * 0.25)
    draw.rounded_rectangle([line_x, line_y, line_x + line_width, line_y + line_height],
                          radius=line_height // 2, fill=(102, 126, 234, 255))
    
    # 线条2 - 紫色（半透明）
    line_y = doc_y + int(doc_height * 0.42)
    draw.rounded_rectangle([line_x, line_y, line_x + int(line_width * 0.78), line_y + line_height],
                          radius=line_height // 2, fill=(118, 75, 162, 153))
    
    # 线条3 - 更浅
    line_y = doc_y + int(doc_height * 0.58)
    draw.rounded_rectangle([line_x, line_y, line_x + int(line_width * 0.89), line_y + line_height],
                          radius=line_height // 2, fill=(102, 126, 234, 102))
    
    # 线条4
    line_y = doc_y + int(doc_height * 0.75)
    draw.rounded_rectangle([line_x, line_y, line_x + int(line_width * 0.67), line_y + line_height],
                          radius=line_height // 2, fill=(118, 75, 162, 128))
    
    # 灯泡圆形
    bulb_radius = int(size * 0.14)
    bulb_x = center + int(size * 0.18)
    bulb_y = center + int(size * 0.18)
    
    # 灯泡光晕
    for r in range(bulb_radius + int(size * 0.08), bulb_radius, -1):
        alpha = int(80 * (r - bulb_radius) / (size * 0.08))
        draw.ellipse([bulb_x - r, bulb_y - r, bulb_x + r, bulb_y + r],
                     fill=(255, 215, 0, alpha))
    
    # 灯泡主体
    draw.ellipse([bulb_x - bulb_radius, bulb_y - bulb_radius, 
                  bulb_x + bulb_radius, bulb_y + bulb_radius],
                 fill=(255, 215, 0, 255))
    
    # 灯泡内部
    inner_radius = int(bulb_radius * 0.33)
    draw.ellipse([bulb_x - inner_radius, bulb_y - inner_radius,
                  bulb_x + inner_radius, bulb_y + inner_radius],
                 fill=(255, 140, 0, 255))
    
    # 灯泡高光
    highlight_x = bulb_x - int(bulb_radius * 0.3)
    highlight_y = bulb_y - int(bulb_radius * 0.3)
    highlight_radius = int(bulb_radius * 0.25)
    draw.ellipse([highlight_x - highlight_radius, highlight_y - highlight_radius,
                  highlight_x + highlight_radius, highlight_y + highlight_radius],
                 fill=(255, 255, 255, 180))
    
    return img

def main():
    """生成不同尺寸的图标"""
    sizes = [16, 48, 128]
    output_dir = os.path.dirname(os.path.abspath(__file__))
    
    print("正在生成LOGO图标...")
    
    for size in sizes:
        img = create_simple_logo(size)
        output_path = os.path.join(output_dir, f'..', f'icon{size}.png')
        img.save(output_path, 'PNG')
        print(f"✓ 生成: icon{size}.png ({size}x{size})")
    
    print("\n✓ 所有图标生成完成!")
    print("文件位置: icons/icon16.png, icons/icon48.png, icons/icon128.png")

if __name__ == '__main__':
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("正在安装 Pillow 库...")
        import subprocess
        subprocess.check_call(['python', '-m', 'pip', 'install', 'Pillow', '-q'])
        from PIL import Image, ImageDraw
        print("✓ Pillow 安装完成\n")
    
    main()
