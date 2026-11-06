import os,time,math,random,threading,urllib.request,http.server as H
E=os.environ.get;P=lambda k,d:float(E(k,d))
CPU=int(E('PROCS','1'));B=P('CPU','0.3');A=P('AMP','0.2');T=P('PERIOD','600');M=P('MEM','200');MA=P('MEMAMP','40')
NET=P('NET','150');PEER=E('PEER','');PORT=int(E('PORT','8080'));PH=random.random()*6
def wave(t,i=0):
 return math.sin(2*math.pi*t/T+PH+i)*.6+math.sin(2*math.pi*t/(T*.37)+PH*2+i)*.3+math.sin(2*math.pi*t/(T*2.3)+i)*.4
def burn(i):
 while 1:
  d=min(.95,max(.02,B+A*wave(time.time(),i)));s=time.time()
  while time.time()-s<.1*d:pass
  time.sleep(.1*(1-d))
for i in range(CPU):
 if os.fork()==0:burn(i)
BLOB=os.urandom(1<<20)
class S(H.BaseHTTPRequestHandler):
 def do_GET(s):
  n=int(s.path.split('n=')[1]) if 'n=' in s.path else 1024
  s.send_response(200);s.send_header('content-length',str(n));s.end_headers()
  while n>0:k=min(n,len(BLOB));s.wfile.write(BLOB[:k]);n-=k
 def log_message(s,*a):pass
threading.Thread(target=H.ThreadingHTTPServer(('',PORT),S).serve_forever,daemon=True).start()
def net():
 while 1:
  try:
   r=max(5,NET*(1+.8*wave(time.time(),1)))*1024
   urllib.request.urlopen(PEER+'?n=%d'%r,timeout=5).read()
  except Exception:pass
  time.sleep(1)
if PEER:threading.Thread(target=net,daemon=True).start()
held=[]
print('ready',flush=True)
while 1:
 want=int(max(16,M+MA*wave(time.time(),2)))
 while len(held)<want:held.append(os.urandom(1<<20))
 del held[want:]
 time.sleep(5)
