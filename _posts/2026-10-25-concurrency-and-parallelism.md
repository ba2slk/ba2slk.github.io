---
title: "Item67: subprocess 모듈로 자식 프로세스를 관리해보자"
book: effective-python
chapter: 9
date: 2026-10-25 21:58:11 +0900
---

## 동시성 vs 병렬성

> **Concurrency**
> 컴퓨터가 같은 시간에 여러 다른 작업을 처리하는 것처럼 보이는 것
- thread
- coroutine

> **Parallelism**
> 실제로 같은 시간에 여러 다른 작업을 처리하는 것
- system call
- subprocess
- C extension

동시성과 병렬성의 핵심적인 차이는 **속도 향상**이다.
- 두 개의 실행 경로가 있는 프로그램을 병렬로 실행하면 작업 수행 시간이 절반으로 줄어듦
- 수 천 개의 실행 경로가 있는 동시 프로그램은 겉으로 보기에는 병렬적으로 실행되는 것처럼 보이지만 전체 작업에 걸리는 시간은 빨라지지 않음

파이썬이 시작한 자식 프로세스는 서로 병렬로 실행되므로 모든 CPU 코어를 사용할 수 있고 그에 따라 프로그램의 throughput을 최대로 높일 수 있다.

### subprocess 모듈 사용

```python
import subprocess

result = subprocess.run(
  ["echo", "Hello"],
  capture_output=True,
  encoding='utf-8',
)

result.check_returncode() # 예외 발생 여부 확인
print(result.stdout)
```

자식 프로세스는 부모 프로세스인 파이썬 인터프리터와 독립적으로 실행된다.

### 자식 프로세스 상태 polling

다른 작업을 수행하면서 주기적으로 자식 프로세스의 상태를 polling할 수 있다.

```python
proc = subprocess.Popen(["sleep", "1"])
while proc.poll() is None:
  print("Working...")

print("Exit status", proc.poll())
```

### 자식 프로세스 병렬 실행

자식 프로세스와 부모 프로세스를 분리하면 부모 프로세스가 원하는 개수만큼 여러 자식 프로세스를 병렬로 실행할 수 있다.

```python
import time

start = time.perf_counter()
sleep_procs = []
for _ in range(10):
  proc = subprocess.Popen(["sleep", "1"])
  sleep_procs.append(proc)

for proc in sleep_procs:
  proc.communicate()

end = time.perf_counter()
delta = end - start
print(f"{delta:.3} seconds passed.")  # 1.01 seconds passed.
```

`communicate` 메서드를 통해 자식 프로세스가 I/O를 끝내고 종료될 때까지 의도적으로 blocked 하여 여러 자식 프로세스의 종료를 기다릴 수 있다.

![](/assets/img/posts/concurrency-and-parallelism/1792932229382-image.png)

### 파이프

```python
import os

def run_encrypt(data):
  env = os.environ.copy()
  env["password"] = "a-random-password"
  proc = subprocess.Popen(
    ["openssl", "enc", "-des3", "-pbkdf2", "-pass", "env:password"],
    env=env,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
  )
  proc.stdin.write(data)
  proc.stdin.flush()  # 자식이 입력을 받도록 보장
  return proc

procs = []
for _ in range(3):
  data = os.urandom(10)
  proc = run_encrypt(data)
  procs.append(proc)

for proc in procs:
  out, _ = proc.communicate()
  print(out[-10:])
```

PIPE로 자식과 데이터를 주고 받는 예제 코드이다. communicate()가 stdin을 닫아줘야 openssl이 입력 끝을 알고 결과를 낸다.

```python
def run_hash(input_stdin):
  return subprocess.Popen(
    ["openssl", "dgst", "-sha256", "-binary"],
    stdin=input_stdin,
    stdout=subprocess.PIPE,
  )

encrypt_procs = []
hash_procs = []
for _ in range(3):
  data = os.urandom(100)

  encrypt_proc = run_encrypt(data)
  encrypt_procs.append(encrypt_proc)

  hash_proc = run_hash(encrypt_proc.stdout)
  hash_procs.append(hash_proc)

  encrypt_proc.stdout.close()
  encrypt_proc.stdout = None

for proc in encrypt_procs:
  proc.communicate()
  assert proc.returncode == 0

for proc in hash_procs:
  out, _ = proc.communicate()
  print(out[-10:])
  assert proc.returncode == 0
```

암호화 프로세스의 stdout을 해시 프로세스의 stdin에 바로 연결한다. 부모 프로세스가 해당 파이프를 닫아야 해시 프로세스가 EOF를 받을 수 있다.

### 자식 프로세스 timeout

```python
proc = subprocess.Popen(["sleep", "10"])
try:
  proc.communicate(timeout=0.1)
except subprocess.TimeoutExpired:
  proc.terminate()
  proc.wait()

print("Exit status", proc.poll())
```

timeout 안에 안 끝나면 TimeoutExpired가 발생한다. terminate()로 종료시키고 wait()로 정리한다. (Exit status -15 = SIGTERM)
