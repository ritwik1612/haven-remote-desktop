// Haven notification area: a small .NET Framework process, no WebView or capture.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class HavenTray {
    internal static readonly string Folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","Haven");
    internal static readonly string State = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Haven");
    internal static string Gui {get {return Path.Combine(Folder,"Haven.exe");}}
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] internal static extern IntPtr FindWindow(string className,string title);
    [DllImport("user32.dll")] internal static extern bool ShowWindow(IntPtr window,int command);
    [DllImport("user32.dll")] internal static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] internal static extern bool PostMessage(IntPtr window,uint message,IntPtr w,IntPtr l);

    [STAThread] private static void Main(string[] args) {
        if(Array.IndexOf(args,"--quit")>=0) {var window=FindWindow(null,"Haven tray");if(window!=IntPtr.Zero)PostMessage(window,0x10,IntPtr.Zero,IntPtr.Zero);return;}
        bool created;
        using(var mutex=new Mutex(true,"Local\\HavenNotificationIcon",out created)) {
            if(!created)return;
            try {Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);using(var context=new TrayContext())Application.Run(context);}
            catch(Exception error) {Directory.CreateDirectory(State);File.WriteAllText(Path.Combine(State,"tray-error.txt"),error.Message);}
            finally {mutex.ReleaseMutex();}
        }
    }

    internal static string Request(string route,string body,CookieContainer cookies) {
        var request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:4318"+route);
        request.Timeout=800;request.ReadWriteTimeout=800;request.Proxy=null;request.CookieContainer=cookies;
        if(body!=null) {
            request.Method="POST";request.ContentType="application/json";request.Headers["Origin"]="http://127.0.0.1:4318";
            var bytes=Encoding.UTF8.GetBytes(body);request.ContentLength=bytes.Length;
            using(var stream=request.GetRequestStream())stream.Write(bytes,0,bytes.Length);
        }
        using(var response=request.GetResponse())using(var reader=new StreamReader(response.GetResponseStream()))return reader.ReadToEnd();
    }

    internal static string Status() {
        try {return Request("/api/info",null,new CookieContainer()).Contains("\"unattended\":true")?"Background host running":"Preview host running";}
        catch {return "Background host unavailable";}
    }

    internal static void EndSession() {
        var file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"Haven","host-url.txt");
        var fragment=new Uri(File.ReadAllText(file).Trim()).Fragment;
        if(!fragment.StartsWith("#host="))throw new InvalidOperationException("Host key is unavailable");
        var token=fragment.Substring(6);foreach(char c in token)if(!Char.IsLetterOrDigit(c)&&c!='_'&&c!='-')throw new InvalidOperationException("Invalid host key");
        var cookies=new CookieContainer();
        Request("/api/admin/login","{\"token\":\""+token+"\"}",cookies);
        Request("/api/admin/revoke","{}",cookies);
    }

    internal static void OpenGui() {
        var window=FindWindow(null,"Haven · Your space. No distance.");
        if(window!=IntPtr.Zero) {ShowWindow(window,9);SetForegroundWindow(window);}
        else if(File.Exists(Gui))Process.Start(new ProcessStartInfo(Gui){UseShellExecute=true,WorkingDirectory=Folder});
    }
}

internal sealed class TrayContext : ApplicationContext {
    private readonly NotifyIcon icon;
    private readonly ContextMenuStrip menu;
    private readonly ToolStripMenuItem status;
    private readonly TrayWindow window;
    internal TrayContext() {
        Directory.CreateDirectory(HavenTray.State);
        window=new TrayWindow(this);
        menu=new ContextMenuStrip {BackColor=Color.FromArgb(20,20,23),ForeColor=Color.Silver,Renderer=new ToolStripProfessionalRenderer(new HavenColors())};
        menu.Items.Add(new ToolStripMenuItem("Haven - Remote Desktop"){Enabled=false});
        status=new ToolStripMenuItem(HavenTray.Status()){Enabled=false};menu.Items.Add(status);menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Open Haven",null,delegate {HavenTray.OpenGui();});
        menu.Items.Add("End current remote session",null,delegate {try {HavenTray.EndSession();}catch {HavenTray.OpenGui();}});
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit tray icon (host stays running)",null,delegate {ExitThread();});
        var image=Icon.ExtractAssociatedIcon(File.Exists(HavenTray.Gui)?HavenTray.Gui:Application.ExecutablePath);
        icon=new NotifyIcon {Icon=image,Text="Haven - "+status.Text,ContextMenuStrip=menu,Visible=true};
        icon.DoubleClick+=delegate {HavenTray.OpenGui();};
        menu.Opening+=delegate {status.Text=HavenTray.Status();icon.Text="Haven - "+status.Text;};
        Record(true);
    }
    private void Record(bool added) {
        File.WriteAllText(Path.Combine(HavenTray.State,"tray-status.json"),"{\"pid\":"+Process.GetCurrentProcess().Id+",\"iconAdded\":"+(added?"true":"false")+",\"nativeFramework\":true,\"tooltip\":\"Haven - "+status.Text+"\"}");
    }
    protected override void ExitThreadCore() {icon.Visible=false;Record(false);base.ExitThreadCore();}
    protected override void Dispose(bool disposing) {if(disposing) {icon.Visible=false;icon.Dispose();menu.Dispose();window.DestroyHandle();}base.Dispose(disposing);}
}

internal sealed class TrayWindow : NativeWindow {
    private readonly TrayContext context;
    internal TrayWindow(TrayContext owner) {context=owner;CreateHandle(new CreateParams {Caption="Haven tray",Style=0,ExStyle=0});}
    protected override void WndProc(ref Message message) {if(message.Msg==0x10) {context.ExitThread();return;}base.WndProc(ref message);}
}

internal sealed class HavenColors : ProfessionalColorTable {
    public override Color ToolStripDropDownBackground {get {return Color.FromArgb(20,20,23);}}
    public override Color ImageMarginGradientBegin {get {return Color.FromArgb(20,20,23);}}
    public override Color ImageMarginGradientMiddle {get {return Color.FromArgb(20,20,23);}}
    public override Color ImageMarginGradientEnd {get {return Color.FromArgb(20,20,23);}}
    public override Color MenuItemSelected {get {return Color.FromArgb(57,33,82);}}
    public override Color MenuItemBorder {get {return Color.FromArgb(152,92,255);}}
    public override Color MenuBorder {get {return Color.FromArgb(63,63,70);}}
}
