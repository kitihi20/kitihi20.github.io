
"""
html等を正常に読み込むために、ローカルサーバーを立てる
http://localhost:8000
"""


import os
import re
import http.server
import socketserver

class Handler1(http.server.SimpleHTTPRequestHandler):
    def send_error(self, code, message=None):
        if code == 404:
            f = open("404.html", 'r',encoding="utf-8_sig")
            web404data = f.read()
            f.close()
            self.error_message_format = web404data
        http.server.SimpleHTTPRequestHandler.send_error(self, code, message)

class Handler2(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        #wasmとかでマルチスレッドするときにこういうのいるんか...GithubPagesでは厳しいか?
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


Handler = http.server.SimpleHTTPRequestHandler

if __name__ == '__main__':

    with socketserver.TCPServer(("", 8000), Handler) as httpd:
        print("serving at port", 8000)
        httpd.serve_forever()

