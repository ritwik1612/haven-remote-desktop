package app.haven.remote;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.view.View;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.net.URI;

/** Same-origin private client. No injected JavaScript bridge or password storage. */
public class MainActivity extends Activity {
    private WebView web;
    private String allowedOrigin;
    private final int background=Color.rgb(11,11,20);
    private int dp(int n) {return Math.round(n*getResources().getDisplayMetrics().density);}
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        showSetup();
    }
    private TextView text(String value,int size,int color) {
        TextView view=new TextView(this);view.setText(value);view.setTextSize(size);view.setTextColor(color);view.setPadding(0,dp(12),0,dp(12));return view;
    }
    private void showSetup() {
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setBackgroundColor(background);layout.setPadding(dp(28),dp(35),dp(28),dp(25));
        ImageView logo=new ImageView(this);logo.setImageResource(R.drawable.haven_icon);layout.addView(logo,new LinearLayout.LayoutParams(dp(60),dp(60)));
        layout.addView(text("Haven",32,Color.rgb(242,230,251)));
        layout.addView(text("Your space.\nNo distance.",38,Color.rgb(221,190,246)));
        layout.addView(text("Connect Tailscale, then enter the private laptop link shown in Haven on your computer.",15,Color.rgb(174,150,194)));
        EditText host=new EditText(this);host.setSingleLine(true);host.setTextSize(15);host.setTextColor(Color.WHITE);host.setHintTextColor(Color.rgb(137,115,157));host.setHint("https://your-laptop.tailnet.ts.net:8443");host.setInputType(17);
        host.setText(getPreferences(MODE_PRIVATE).getString("host",""));layout.addView(host,new LinearLayout.LayoutParams(-1,dp(62)));
        Button connect=new Button(this);connect.setText("Connect to my laptop");connect.setTextColor(background);connect.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(193,160,233)));layout.addView(connect,new LinearLayout.LayoutParams(-1,dp(55)));
        layout.addView(text("Pair once. Enter your six-digit PIN for a six-hour session. Your PIN is never saved in this app.",12,Color.rgb(150,128,170)));
        connect.setOnClickListener(new View.OnClickListener(){@Override public void onClick(View v){try {
            String value=host.getText().toString().trim();if(!value.startsWith("https://"))value="https://"+value;
            URI uri=new URI(value);String hostname=uri.getHost();
            if(!"https".equals(uri.getScheme())||hostname==null||!hostname.endsWith(".ts.net")||uri.getUserInfo()!=null||uri.getRawQuery()!=null||uri.getFragment()!=null||!(uri.getPath().isEmpty()||uri.getPath().equals("/")||uri.getPath().equals("/connect")))throw new Exception();
            allowedOrigin="https://"+hostname+(uri.getPort()==-1?"":":"+uri.getPort());
            getPreferences(MODE_PRIVATE).edit().putString("host",allowedOrigin).apply();
            ((InputMethodManager)getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(host.getWindowToken(),0);
            openDesktop();
        }catch(Exception error){Toast.makeText(MainActivity.this,"Enter the HTTPS .ts.net link from your laptop.",Toast.LENGTH_LONG).show();}}});
        setContentView(layout);
    }
    private void openDesktop() {
        web=new WebView(this);web.setBackgroundColor(background);
        web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(0);web.getSettings().setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri url=request.getUrl();String origin=url.getScheme()+"://"+url.getHost()+(url.getPort()==-1?"":":"+url.getPort());
                if(allowedOrigin.equals(origin))return false;
                if("https".equals(url.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,url));
                return true;
            }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){handler.cancel();Toast.makeText(MainActivity.this,"Certificate check failed. Connection blocked.",Toast.LENGTH_LONG).show();}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())Toast.makeText(MainActivity.this,"Laptop unreachable. Check Tailscale and that the background host is running.",Toast.LENGTH_LONG).show();}
            @Override public void onPageFinished(WebView view,String url){CookieManager.getInstance().flush();}
        });
        LinearLayout frame=new LinearLayout(this);frame.setOrientation(LinearLayout.VERTICAL);frame.setBackgroundColor(background);frame.addView(web,new LinearLayout.LayoutParams(-1,-1));
        frame.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener(){@Override public WindowInsets onApplyWindowInsets(View v,WindowInsets insets){v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;}});
        setContentView(frame);web.loadUrl(allowedOrigin+"/connect");
    }
    @Override public void onBackPressed(){if(web!=null){web.destroy();web=null;showSetup();}else super.onBackPressed();}
}
