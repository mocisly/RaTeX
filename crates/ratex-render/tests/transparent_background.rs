use std::path::PathBuf;

use ratex_layout::{layout, to_display_list, LayoutOptions};
use ratex_parser::parser::parse;
use ratex_render::{render_to_png, RenderOptions};
use ratex_types::color::Color;

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
}

fn font_dir() -> String {
    project_root()
        .join("tools/lexer_compare/node_modules/katex/dist/fonts")
        .to_string_lossy()
        .to_string()
}

fn render_sample(background_color: Color) -> Option<Vec<u8>> {
    let font_dir = font_dir();
    if !std::path::Path::new(&font_dir).exists() {
        return None;
    }

    let ast = parse("x").expect("parse sample formula");
    let layout = layout(&ast, &LayoutOptions::default());
    let display_list = to_display_list(&layout);

    Some(
        render_to_png(
            &display_list,
            &RenderOptions {
                font_size: 40.0,
                padding: 8.0,
                background_color,
                font_dir,
                device_pixel_ratio: 1.0,
            },
        )
        .expect("render PNG"),
    )
}

fn first_pixel_rgba(png_bytes: &[u8]) -> [u8; 4] {
    let decoder = png::Decoder::new(std::io::Cursor::new(png_bytes));
    let mut reader = decoder.read_info().expect("decode PNG info");
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).expect("decode PNG frame");
    buf.truncate(info.buffer_size());
    [buf[0], buf[1], buf[2], buf[3]]
}

#[test]
fn render_to_png_uses_transparent_background() {
    let Some(png) = render_sample(Color::new(0.0, 0.0, 0.0, 0.0)) else {
        eprintln!("SKIP transparent_background: KaTeX font_dir missing");
        return;
    };
    assert_eq!(first_pixel_rgba(&png), [0, 0, 0, 0]);
}

#[test]
fn render_to_png_keeps_opaque_background_by_default() {
    let Some(png) = render_sample(Color::WHITE) else {
        eprintln!("SKIP transparent_background: KaTeX font_dir missing");
        return;
    };
    assert_eq!(first_pixel_rgba(&png), [255, 255, 255, 255]);
}
