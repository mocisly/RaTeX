// RaTeXFormulaSpan.kt — ReplacementSpan that renders a LaTeX formula inline with text.
//
// Inserted at a U+FFFC (object replacement character) position in a SpannableString,
// this span draws the formula via RaTeXRenderer and reports metrics so that the
// Android text layout engine treats the formula as a single inline "character".

package io.ratex

import android.graphics.Canvas
import android.graphics.Paint
import android.text.style.ReplacementSpan
import kotlin.math.ceil
import kotlin.math.roundToInt

class RaTeXFormulaSpan(
    private val renderer: RaTeXRenderer,
) : ReplacementSpan() {

    private val widthPx = renderer.widthPx
    private val ascentPx = renderer.heightPx
    private val descentPx = renderer.depthPx

    override fun getSize(
        paint: Paint,
        text: CharSequence?,
        start: Int,
        end: Int,
        fm: Paint.FontMetricsInt?,
    ): Int {
        fm?.let {
            it.ascent = -ceil(ascentPx).toInt()
            it.descent = ceil(descentPx).toInt()
            it.top = it.ascent
            it.bottom = it.descent
        }
        return ceil(widthPx).roundToInt()
    }

    override fun draw(
        canvas: Canvas,
        text: CharSequence?,
        start: Int,
        end: Int,
        x: Float,
        top: Int,
        y: Int,
        bottom: Int,
        paint: Paint,
    ) {
        canvas.save()
        canvas.translate(x, y - ascentPx)
        renderer.draw(canvas)
        canvas.restore()
    }
}
