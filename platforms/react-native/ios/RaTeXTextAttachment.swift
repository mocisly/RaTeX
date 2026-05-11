// RaTeXTextAttachment.swift — NSTextAttachment that renders a LaTeX formula inline with text.
//
// The attachment pre-renders the formula to a UIImage and sets bounds so that
// the formula's baseline aligns with the surrounding text baseline.

import UIKit

@MainActor
class RaTeXTextAttachment: NSTextAttachment {

    init(renderer: RaTeXRenderer) {
        super.init(data: nil, ofType: nil)

        let size = CGSize(width: renderer.width, height: renderer.totalHeight)
        guard size.width > 0, size.height > 0 else { return }

        let format = UIGraphicsImageRendererFormat()
        format.scale = UIScreen.main.scale
        let imageRenderer = UIGraphicsImageRenderer(size: size, format: format)
        self.image = imageRenderer.image { ctx in
            renderer.draw(in: ctx.cgContext)
        }

        // origin.y = -depth shifts the image down so the formula baseline
        // (at `height` from the top) aligns with the text baseline.
        self.bounds = CGRect(
            x: 0,
            y: -renderer.depth,
            width: size.width,
            height: size.height
        )
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) not supported")
    }
}
