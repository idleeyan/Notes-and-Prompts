#!/usr/bin/env python3
"""
将SVG LOGO转换为Chrome扩展所需的不同尺寸PNG图标
需要安装: pip install cairosvg
"""

import cairosvg
import os

# 图标尺寸
SIZES = [16, 48, 128]

# LOGO文件
LOGOS = [
    ('logo1_modern.svg', 'modern'),
    ('logo2_flat.svg', 'flat'),
    ('logo3_gradient.svg', 'gradient')
]

def convert_svg_to_png(svg_path, output_path, size):
    """将SVG转换为PNG"""
    cairosvg.svg2png(
        url=svg_path,
        write_to=output_path,
        output_width=size,
        output_height=size
    )
    print(f"✓ 生成: {output_path}")

def main():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    for svg_file, style_name in LOGOS:
        svg_path = os.path.join(current_dir, svg_file)
        
        if not os.path.exists(svg_path):
            print(f"✗ 文件不存在: {svg_path}")
            continue
        
        print(f"\n正在处理 {style_name} 风格...")
        
        # 为每种尺寸生成图标
        for size in SIZES:
            output_name = f"icon{size}_{style_name}.png"
            output_path = os.path.join(current_dir, output_name)
            convert_svg_to_png(svg_path, output_path, size)
    
    print("\n✓ 所有图标生成完成!")
    print("\n使用说明:")
    print("1. 查看生成的图标文件")
    print("2. 选择你喜欢的风格")
    print("3. 将选中的图标复制到上级目录并命名为 icon16.png, icon48.png, icon128.png")

if __name__ == '__main__':
    main()
