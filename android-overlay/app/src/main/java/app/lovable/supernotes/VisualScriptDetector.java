package app.lovable.supernotes;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
import java.util.ArrayList;
import java.util.List;

/**
 * A small image-FIRST, offline writing-system detector. It is deliberately
 * conservative: compare normalized connected ink shapes with synthetic
 * templates drawn by Android's already installed fallback fonts, without
 * running ML Kit or the Cyrillic recognizer and without any downloaded data.
 *
 * Latin and Cyrillic share many glyph shapes; Han is common to Chinese and
 * Japanese. Weak/mixed results MUST return "unknown", never a guessed script.
 */
public final class VisualScriptDetector {
    private VisualScriptDetector() {}
    private static final String[] LABELS =
        {"latin","cyrillic","japanese","han","korean","devanagari"};
    private static final String[] GLYPHS = {
        "abcdefghijklmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ",
        "абвгдежзийклмнопрстуфхцчшщъыьэюяәғқңөұүһі",
        "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコ",
        "中文汉字学习工作技术社会生活人生语言地图时间城市信息天气学校经济科技世界国家文化新闻教育",
        "가나다라마바사아자차카타파하한국어문장텍스트학습사진기술정보시간학교사람사랑세계",
        "कखगघचछजझटठडढणतथदधनपफबभमयरलवशषसहअआइईउऊएऐओऔ"
    };
    private static volatile long[][] templates;

    public static final class Result {
        public final String script;
        public final int votes;
        public final int compared;
        private Result(String script,int votes,int compared) {
            this.script=script; this.votes=votes; this.compared=compared;
        }
        public boolean isConfident() {return !"unknown".equals(script);}
    }

    private static long[][] templates() {
        long[][] cached=templates;
        if(cached!=null)return cached;
        synchronized(VisualScriptDetector.class) {
            if(templates!=null)return templates;
            long[][] generated=new long[GLYPHS.length][];
            Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setTypeface(Typeface.create("sans-serif",Typeface.NORMAL));
            paint.setColor(Color.BLACK);
            paint.setTextSize(43f);
            Bitmap tile=Bitmap.createBitmap(64,64,Bitmap.Config.ARGB_8888);
            Canvas canvas=new Canvas(tile);
            Rect bounds=new Rect();
            for(int script=0;script<GLYPHS.length;script++) {
                int[] points=GLYPHS[script].codePoints().toArray();
                long[] masks=new long[points.length];
                for(int i=0;i<points.length;i++) {
                    String glyph=new String(Character.toChars(points[i]));
                    tile.eraseColor(Color.WHITE);
                    paint.getTextBounds(glyph,0,glyph.length(),bounds);
                    canvas.drawText(glyph,4-bounds.left,4-bounds.top,paint);
                    masks[i]=mask(tile,0,0,64,64,null,0);
                }
                generated[script]=masks;
            }
            tile.recycle();
            templates=generated;
            return generated;
        }
    }

    /** 8x8 bitmap fingerprint, crop the visible ink, ignore whitespace. */
    private static long mask(Bitmap bitmap,int left,int top,int right,int bottom,
                             int[] labels,int component) {
        int width=bitmap.getWidth(),height=bitmap.getHeight();
        int x0=right,y0=bottom,x1=left-1,y1=top-1;
        for(int y=top;y<bottom;y++)for(int x=left;x<right;x++){
            boolean selected=labels==null
                ? brightness(bitmap.getPixel(x,y))<160
                : labels[y*width+x]==component;
            if(selected){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
        }
        if(x1<x0||y1<y0)return 0L;
        long bits=0;
        int w=x1-x0+1,h=y1-y0+1;
        for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++){
            boolean selected=labels==null
                ? brightness(bitmap.getPixel(x,y))<160
                : labels[y*width+x]==component;
            if(selected){
                int col=Math.min(7,(x-x0)*8/w);
                int row=Math.min(7,(y-y0)*8/h);
                bits|=1L<<(row*8+col);
            }
        }
        return bits;
    }

    private static int brightness(int argb) {
        return (Color.red(argb)*3+Color.green(argb)*6+Color.blue(argb))/10;
    }

    /**
     * Fast bounded probe. Maximum 640x480 ink pixels, 120 character-like
     * components and fixed 8x8 fingerprints. No full-image OCR or network.
     * This classifier is not a language identifier and must abstain often.
     */
    public static Result classify(Bitmap input) {
        if(input==null||input.isRecycled())return new Result("unknown",0,0);
        Bitmap bitmap=input;
        if(input.getWidth()>640||input.getHeight()>480) {
            float factor=Math.min(640f/input.getWidth(),480f/input.getHeight());
            bitmap=Bitmap.createScaledBitmap(input,
                Math.max(1,Math.round(input.getWidth()*factor)),
                Math.max(1,Math.round(input.getHeight()*factor)),true);
        }
        try {
            int w=bitmap.getWidth(),h=bitmap.getHeight();
            if(w<60||h<40)return new Result("unknown",0,0);
            int[] ink=new int[w*h],labels=new int[w*h],queue=new int[w*h];
            int corners=(brightness(bitmap.getPixel(0,0))+
                brightness(bitmap.getPixel(w-1,0))+
                brightness(bitmap.getPixel(0,h-1))+
                brightness(bitmap.getPixel(w-1,h-1)))/4;
            boolean darkText=corners>=128;
            int threshold=darkText?145:175;
            for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
                int b=brightness(bitmap.getPixel(x,y));
                ink[y*w+x]=(darkText?b<threshold:b>threshold)?1:0;
            }
            long[][] sample=templates();
            int[] votes=new int[LABELS.length];
            int count=0,seen=0;
            // Segment connected ink, then classify only plausible single
            // letter shapes; ornamental lines and photos will be ignored.
            for(int y=1;y<h-1 && count<120;y++)for(int x=1;x<w-1 && count<120;x++){
                int origin=y*w+x;
                if(ink[origin]==0||labels[origin]!=0)continue;
                int head=0,tail=1,id=++seen;
                queue[0]=origin;labels[origin]=id;
                int left=x,right=x,top=y,bottom=y;
                while(head<tail) {
                    int at=queue[head++],px=at%w,py=at/w;
                    if(px<left)left=px;if(px>right)right=px;
                    if(py<top)top=py;if(py>bottom)bottom=py;
                    int[] sides={at-1,at+1,at-w,at+w};
                    for(int n=0;n<4;n++){
                        int next=sides[n];
                        if(n==0&&px==0||n==1&&px==w-1||
                            n==2&&py==0||n==3&&py==h-1)continue;
                        if(ink[next]==1&&labels[next]==0){
                            labels[next]=id;queue[tail++]=next;
                        }
                    }
                }
                int gw=right-left+1,gh=bottom-top+1;
                if(gw<4||gh<6||gw>90||gh>95||tail<15||
                    (float)gw/gh<0.18f||(float)gw/gh>3.0f)continue;
                long shape=mask(bitmap,left,top,right+1,bottom+1,labels,id);
                if(Long.bitCount(shape)<10)continue;
                int first=1000,second=1000,best=-1;
                for(int group=0;group<sample.length;group++) {
                    int dist=1000;
                    for(long template:sample[group])
                        dist=Math.min(dist,Long.bitCount(template^shape));
                    if(dist<first) {second=first;first=dist;best=group;}
                    else if(dist<second)second=dist;
                }
                count++;
                if(best>=0&&first<=19&&second-first>=5)votes[best]++;
            }
            int winner=-1,most=0,runnerUp=0,total=0;
            for(int i=0;i<votes.length;i++){
                total+=votes[i];
                if(votes[i]>most){runnerUp=most;most=votes[i];winner=i;}
                else runnerUp=Math.max(runnerUp,votes[i]);
            }
            // At most a strong independent clue, never proof the page is
            // single-language. Confidence requires repeated distinct shapes.
            int minVotes=winner==0||winner==1?10:7;
            if(winner<0||most<minVotes||most*100<total*83||
                most<runnerUp*5||count<12)
                return new Result("unknown",most,count);
            return new Result(LABELS[winner],most,count);
        } finally {
            if(bitmap!=input)bitmap.recycle();
        }
    }
}
