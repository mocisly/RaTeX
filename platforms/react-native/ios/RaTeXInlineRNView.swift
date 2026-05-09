// RaTeXInlineRNView.swift — ObjC-compatible wrapper around RaTeXInlineView for React Native.

import UIKit

@objc(RaTeXInlineRNView)
@MainActor
public class RaTeXInlineRNView: UIView {

    private let innerView = RaTeXInlineView()
    private var bridgedColor: UIColor?
    private var bridgedTextColor: UIColor?

    // MARK: - ObjC-bridgeable properties

    @objc public var content: String {
        get { innerView.content }
        set { innerView.content = newValue; invalidateIntrinsicContentSize(); setNeedsLayout() }
    }

    @objc public var fontSize: CGFloat {
        get { innerView.formulaFontSize }
        set { innerView.formulaFontSize = newValue; invalidateIntrinsicContentSize(); setNeedsLayout() }
    }

    @objc public var color: UIColor? {
        get { bridgedColor }
        set {
            guard !isSameColor(newValue, bridgedColor) else { return }
            bridgedColor = newValue
            innerView.formulaColor = newValue ?? .black
        }
    }

    @objc public var textColor: UIColor? {
        get { bridgedTextColor }
        set {
            guard !isSameColor(newValue, bridgedTextColor) else { return }
            bridgedTextColor = newValue
            innerView.textColor = newValue ?? .black
        }
    }

    @objc public var textFontSize: CGFloat {
        get { innerView.textFontSize }
        set { innerView.textFontSize = newValue; invalidateIntrinsicContentSize(); setNeedsLayout() }
    }

    // MARK: - Event callbacks

    @objc public var onContentSizeChange: ((NSDictionary?) -> Void)?

    @objc public func setContentSizeCallback(_ handler: ((CGFloat, CGFloat) -> Void)?) {
        contentSizeCallback = handler
    }
    private var contentSizeCallback: ((CGFloat, CGFloat) -> Void)?

    // MARK: - Init

    public override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    // MARK: - Layout

    public override var intrinsicContentSize: CGSize {
        innerView.intrinsicContentSize
    }

    // MARK: - Private

    private func setup() {
        backgroundColor = .clear
        addSubview(innerView)
        innerView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            innerView.leadingAnchor.constraint(equalTo: leadingAnchor),
            innerView.trailingAnchor.constraint(equalTo: trailingAnchor),
            innerView.topAnchor.constraint(equalTo: topAnchor),
            innerView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])

        if !RaTeXInlineRNView.fontsLoaded {
            RaTeXFontLoader.loadFromBundle(RaTeXInlineRNView.fontsBundle)
            RaTeXInlineRNView.fontsLoaded = true
        }

        innerView.onContentSizeChange = { [weak self] w, h in
            self?.onContentSizeChange?(["width": w, "height": h])
            self?.contentSizeCallback?(w, h)
        }
    }

    private static let fontsBundle: Bundle = {
        let module = Bundle(for: RaTeXInlineRNView.self)
        if let url = module.url(forResource: "RaTeXFonts", withExtension: "bundle"),
           let bundle = Bundle(url: url) {
            return bundle
        }
        return module
    }()

    private static var fontsLoaded = false

    private func isSameColor(_ a: UIColor?, _ b: UIColor?) -> Bool {
        if a == nil && b == nil { return true }
        guard let a, let b else { return false }
        return a.isEqual(b)
    }
}
