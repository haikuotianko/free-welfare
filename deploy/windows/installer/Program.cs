using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;

internal static class Program
{
    private static string TargetDir()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Free Welfare");
    }

    private static void ExtractPayload(string target)
    {
        Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip");
        if (payload == null) throw new InvalidOperationException("安装包缺少 payload.zip");

        string tempZip = Path.Combine(Path.GetTempPath(), "free-welfare-payload.zip");
        using (FileStream output = File.Create(tempZip))
        {
            payload.CopyTo(output);
        }
        payload.Dispose();

        string root = Path.GetFullPath(target);
        using (ZipArchive archive = ZipFile.OpenRead(tempZip))
        {
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                string destination = Path.GetFullPath(Path.Combine(root, entry.FullName));
                if (!destination.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                if (string.IsNullOrEmpty(entry.Name))
                {
                    Directory.CreateDirectory(destination);
                    continue;
                }
                Directory.CreateDirectory(Path.GetDirectoryName(destination));
                entry.ExtractToFile(destination, true);
            }
        }
        File.Delete(tempZip);
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string arguments, string workingDirectory, string icon)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) return;
        object shell = Activator.CreateInstance(shellType);
        object shortcut = shellType.InvokeMember(
            "CreateShortcut",
            BindingFlags.InvokeMethod,
            null,
            shell,
            new object[] { shortcutPath });
        Type shortcutType = shortcut.GetType();
        shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
        shortcutType.InvokeMember("Arguments", BindingFlags.SetProperty, null, shortcut, new object[] { arguments });
        shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDirectory });
        if (File.Exists(icon))
        {
            shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { icon });
        }
        shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
    }

    private static void Main()
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        string target = TargetDir();
        bool noShortcuts = false;
        bool noStart = false;
        string[] cli = Environment.GetCommandLineArgs();
        for (int i = 1; i < cli.Length; i++)
        {
            if (cli[i] == "--dir" && i + 1 < cli.Length)
            {
                target = Path.GetFullPath(cli[++i]);
            }
            else if (cli[i] == "--no-shortcuts")
            {
                noShortcuts = true;
            }
            else if (cli[i] == "--no-start")
            {
                noStart = true;
            }
        }

        Console.WriteLine("正在安装 Free Welfare 到：" + target);
        Directory.CreateDirectory(target);
        ExtractPayload(target);

        string powershell = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.System),
            @"WindowsPowerShell\v1.0\powershell.exe");
        string startScript = Path.Combine(target, @"deploy\windows\start.ps1");
        string icon = Path.Combine(target, @"deploy\windows\free-welfare.ico");
        string arguments = "-NoLogo -NoExit -ExecutionPolicy Bypass -File \"" + startScript + "\"";

        if (!noShortcuts)
        {
            try
            {
                string startMenu = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                    "Free Welfare.lnk");
                CreateShortcut(startMenu, powershell, arguments, target, icon);

                string desktop = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    "Free Welfare.lnk");
                CreateShortcut(desktop, powershell, arguments, target, icon);
                Console.WriteLine("已创建开始菜单和桌面快捷方式。");
            }
            catch (Exception error)
            {
                Console.WriteLine("创建快捷方式失败：" + error.Message);
            }
        }

        Console.WriteLine();
        Console.WriteLine("安装完成。首次启动会联网安装依赖并构建，需要几分钟。");
        if (noStart)
        {
            Console.WriteLine("已跳过启动。");
            return;
        }

        Console.Write("现在启动 Free Welfare？[Y/n] ");
        string answer = Console.ReadLine();
        if (answer == null || answer.Trim().Length == 0 || answer.Trim().Equals("y", StringComparison.OrdinalIgnoreCase))
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = powershell,
                Arguments = arguments,
                WorkingDirectory = target,
                UseShellExecute = true
            });
        }
        else
        {
            Console.WriteLine("可从开始菜单或桌面快捷方式启动。");
        }
    }
}
