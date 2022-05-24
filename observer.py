import sys
import time
import os
import subprocess
from watchdog.observers import Observer
from watchdog.events import PatternMatchingEventHandler

def transpile_file(file):
    cmd = 'npx babel {} --source-maps -o {}'.format(file, file.replace('./src', './lib'))
    print(cmd)
    os.system(cmd)


class MyEH(PatternMatchingEventHandler):

    def __init__(self):
        PatternMatchingEventHandler.__init__(self, patterns=['*.js', '*.glsl'], ignore_directories=True)

    def on_modified(self, event):
        if (event.src_path.endswith('.js')):
            transpile_file(event.src_path)
        elif event.src_path.endswith('.glsl'):
            # find all the files that uses this
            file_list = subprocess.check_output(['git', 'grep', '-l', os.path.basename(event.src_path), '--', 'src'])
            print('## ' + event.src_path)
            for file in file_list.split(b'\n'):
                if file != b'':
                    transpile_file('./' + file.decode())



if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else '.'
    event_handler = MyEH()
    observer = Observer()
    observer.schedule(event_handler, path, recursive=True)
    observer.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
