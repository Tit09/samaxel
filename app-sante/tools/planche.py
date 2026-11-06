import sys
from PIL import Image
fs=sys.argv[2:]; ims=[Image.open(f).resize((412,860)) for f in fs]
o=Image.new('RGB',(422*len(ims)-10,860),'white')
for k,i in enumerate(ims): o.paste(i,(422*k,0))
o.save(sys.argv[1])
